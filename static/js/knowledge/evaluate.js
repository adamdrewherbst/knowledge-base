        /*

        RELATION EVALUATION:

        Scheme: Start with the relation R.  For each node N, take its concept C, and find all laws L
        that have a predicate on C.  Trace the predicate of L up to its roots, all the while matching its
        nodes with those of the relation R.  If they all match up, retain the map between nodes of L and R.

        If two maps M1 and M2 for the same law, different predicate nodes P1 and P2, are found to intersect - that is,
        each node of R that is in both M1 and M2 maps to the same node of L, and each node of L that is in both M1 and M2
        maps to the same node of R - then we check for a logic (AND/OR) relation between P1 and P2 in L.  If there is one,
        we merge M1 and M2 into a new map M3 (still retaining M1 and M2).

        When another map M4 is later merged with M3, we again combine the predicate nodes of M4 and M3 using logic
        from L.  As we keep merging maps, eventually we may have a map whose predicate nodes completely satisfy L.
        At that point, we can append to our relation R the additional knowledge (relations) that L provides us.

        Meta-Relations:
        There can be general relations between concepts independent of any context.  For example, 'sum' and 'difference'
        are inverses, as are several other pairs of mathematical concepts.  We express this as 'sum.inverse => difference'
        and 'difference.inverse => sum'.
            How do we apply this?  We can append '.inverse => difference' to every 'sum' in the relation, ie. have 'sum' and
        'difference' be predicates in the above relation.  Or, we can have it be a concept relation with no predicates,
        in which case it never gets appended to a relation but can itself be used as a predicate.  But then we can't match
        on the 'inverse' node because it won't be in the relation.  Instead, seeing that 'inverse' is a meta-relation,
        we have to check all meta-relation children of 'sum' to see if one of them is 'inverse', and then keep going from that
        match.
            Is this related to matching on node data?  A node may have data which is not itself represented as a node -
        but it will be represented as a node in the law's predicate.  Once the node is matched, we match the data child by
        seeing if the node has that data.  If it does, the node is marked as matching that data node.

        */

        Relation.prototype.evaluate = function(opts) {

            let self = this;
            if(opts) self.options.evaluate = opts;
            opts = self.options.evaluate;

            self.stats.evaluate.nodesChecked = 0;
            self.stats.evaluate.nodesAppended = 0;

            $('#evaluate-msg').text('Evaluating...');
            if(opts.reset) {
                self.reset();
                self.syncGraph();
            }

            self.law.evaluate();
            $('#evaluate-msg').text('Done evaluating');

            console.log('');
            console.log('Checked ' + self.stats.evaluate.nodesChecked + ' nodes');
            console.log('Created ' + self.law.nextMapId + ' maps');
            console.log('Appended ' + self.stats.evaluate.nodesAppended + ' nodes');
        };


        Relation.prototype.reset = function() {
            this.law.reset();
            $('#suggestion-wrapper').empty();
            this.symbolize();
            this.visualize();
        };

        Relation.prototype.getEvaluateTag = function() {
            return Misc.getIndex(this.options, 'evaluate', 'tag') || '';
        };


        function Map(law) {
            this.law = law;
            this.relation = law.relation;
            this.id = law.nextMapId;

            this.idMap = {};
            this.deepPredicates = [];
            this.deepNodes = [];
            this.valueMap = {};
            this.intersections = {};
        }

        Map.prototype.toString = function() {
            let self = this, str = [];
            self.deepPredicates.forEach(function(predicateId) {
                let nodeId = self.idMap[predicateId];
                str.push('' + nodeId + ' => ' + self.relation.findEntry('node', predicateId).toString());
            });
            return str.join(', ');
        };

        Map.prototype.addNode = function(node, predicate) {
            let self = this;
            if(!node || !predicate) return false;
            if(self.idMap[node.id] === predicate.id && self.idMap[predicate.id] === node.id) return true;

            console.log('adding node ' + node.id + ' to map ' + this.id + ' as ' + predicate.toString());

            self.idMap[node.id] = predicate.id;
            self.idMap[predicate.id] = node.id;

            if(!node.maps[predicate.id]) node.maps[predicate.id] = {};
            for(let mapId in node.maps[predicate.id]) {
                self.intersections[mapId] = node.maps[predicate.id][mapId];
            }
            node.maps[predicate.id][self.id] = self;

            for(let i = 0; i < 2; i++) {
                let nodeParent = node.getParent(i), predicateParent = predicate.getParent(i);
                if(!predicateParent) continue;
                if(!nodeParent || !self.addNode(nodeParent, predicateParent)) return false;
            }
            return true;
        };

        Map.prototype.merge = function(other) {
            let self = this, map = new Map(self.law);
            map.law = self.law;
            map.predicateLaw = self.predicateLaw;

            for(let n in self.idMap) {
                if(other.idMap.hasOwnProperty(n) && self.idMap[n] != other.idMap[n]) return false;
            }

            map.deepPredicates = [];
            for(let i = 0; i < 2; i++) {
                let currentMap = i == 0 ? self : other;
                currentMap.deepPredicates.forEach(function(n) {
                    if(map.deepPredicates.indexOf(n) < 0) map.deepPredicates.push(n);
                    let node = self.relation.findEntry('node', currentMap.idMap[n]),
                        predicate = self.relation.findEntry('node', n);
                    map.addNode(node, predicate);
                });
            }
            delete map.intersections[self.id];
            delete map.intersections[other.id];

            return map;
        };

        Map.prototype.checkIntersections = function() {
            let self = this;
            for(let mapId in this.intersections) {
                self.checkIntersection(self.intersections[mapId]);
            }
        };

        Map.prototype.checkIntersection = function(other) {

            let self = this, law = self.law;
            console.log('intersecting map ' + self.id + ' with ' + other.id);
            console.log('  ' + self.toString() + "\n  " + other.toString());

            //make sure the two maps are for the same law, but their deep node sets are disjoint
            if(self.predicateLaw !== other.predicateLaw) return false;
            let disjoint = self.deepPredicates.every(function(n) {
                    return other.deepPredicates.indexOf(n) < 0;
                });
            if(!disjoint) return false;

            console.log('  have ' + JSON.stringify(self.deepPredicates) + ',' + JSON.stringify(other.deepPredicates)
                + ' of ' + JSON.stringify(self.predicateLaw.predicateSets));

            //make sure there's no existing map that would be a duplicate of this intersection
            let predicates = {}, duplicates = {};
            for(let i = 0; i < 2; i++) {
                let currentMap = i == 0 ? self : other;
                currentMap.deepPredicates.forEach(function(n) {
                    let node = self.relation.findEntry('node', currentMap.idMap[n]);
                    for(let m in node.maps[n]) duplicates[m] = true;
                    predicates[n] = node;
                });
            }
            for(let d in duplicates) {
                for(let n in predicates) {
                    if(!predicates[n].maps[n].hasOwnProperty(d)) delete duplicates[d];
                }
            }
            if(Object.keys(duplicates).length > 0) {
                console.log('  already covered by map ' + Object.keys(duplicates).toString());
                return false;
            }

            //and that the joint deep node set is part of a set that satisfies the law
            let deepPredicates = self.deepPredicates.concat(other.deepPredicates), match = null;
            let cannotCombine = self.predicateLaw.predicateSets.every(function(mset) {
                let isSubset = deepPredicates.every(function(n) {
                    return mset.indexOf(n) >= 0;
                }), isMatch = false;
                if(isSubset) {
                    console.log('   subset');
                    //meanwhile, check if the deep nodes in the two maps in fact satisfy the law/set
                    isMatch = mset.every(function(m) {
                        return deepPredicates.indexOf(m) >= 0;
                    });
                    if(isMatch) {
                        match = mset;
                        console.log('   match');
                    }
                }
                return !isSubset && !isMatch;
            });

            if(match == null && cannotCombine) {
                console.log('   match failure');
                return false;
            }

            //whichever relation nodes are shared by the two maps must be mapped to the same match node
            for(let node in self.idMap) {
                if(!other.idMap.hasOwnProperty(node)) continue;
                if(other.idMap[node] != self.idMap[node]) return false;
            }
            console.log('   success');

            //at this point they do intersect, so create a new map by merging these two
            let map = self.merge(other);
            if(!map) return false;
            law.addMap(map);

            //if the law has been satisfied, use the map to append the knowledge of the law to our relation
            if(match) {
                map.append();
            } else {
                map.checkIntersections();
            }

            return true;
        };

        //given a correspondence between nodes in the relation and predicate, fill in the rest of the law
        Map.prototype.append = function() {

            var self = this;
            self.satisfied = true;
            self.tentative = relation.options.evaluate.tentative || false;

            //update our relation with all value intersections calculated during the mapping
            for(let node in self.valueMap) {
                //self.nodes[node].value = map.value[node];
            }

            //start at each deep node of the law
            console.log('appending ' + self.predicateLaw.name);
            self.deepNodes = [];
            self.predicateLaw.deepNodes.forEach(function(nodeId) {
               let appendedNode = self.appendNode(nodeId);
               if(!appendedNode) {
                   console.err("couldn't append deep node " + nodeId);
               } else self.deepNodes.push(appendedNode.getId());
            });
        };

        Map.prototype.appendNode = function(nodeId) {

            let self = this, law = self.law, relation = self.relation;
            if(self.idMap.hasOwnProperty(nodeId)) return relation.findEntry('node', self.idMap[nodeId]);

            let node = relation.findEntry('node', nodeId), head = node.head, reference = node.reference,
                newHead = null, newReference = null;
            let tentative = relation.options.evaluate.tentative || false;

            //if the head and reference of this node haven't been appended yet, do that first
            if(head) {
                newHead = self.appendNode(head);
                if(newHead == null) return null;
            }
            if(reference) {
                newReference = self.appendNode(reference);
                if(newReference == null) return null;
            }

            //data nodes are treated separately as they are added to the node's data tree/command set
            if(node.isData()) return self.appendDataNode(node, newHead, newReference);

            //if the head and reference are already related by this concept, don't add the node
            let childMatch = null;
            if(head) {
                newHead.getChildren(0).every(function(child) {
                    if(child.concept == node.concept && (!reference || child.reference == newReference.getId())) {
                        childMatch = child;
                        return false;
                    }
                    return true;
                });
            }
            if(childMatch) {
                childMatch.addFromMap(self);
                return childMatch;
            }

            let newNode = law.addNode({
                'law': law.id,
                'concept': node.concept,
                'head': newHead ? parseInt(newHead) : null,
                'reference': newReference ? parseInt(newReference) : null,
                'value': node.value,
                'appended': true,
            }), newId = newNode.getId();

            newNode.addFromMap(self);
            newNode.setTentative(self);
            relation.stats.evaluate.nodesAppended++;

            self.idMap[nodeId] = newId;
            self.idMap[newId] = nodeId;

            return newNode;
        };

        Map.prototype.appendDataNode = function(node, head, ref) {
            let self = this;
            if(!head) return false;
            if(head instanceof Node) head = {type: 'node', node: head};

            //if this is part of a data tree, just return the key
            if(!ref) {
                if(head.type === 'node') {
                    return {
                        type: 'data',
                        node: head.node,
                        key: node.getDataKey()
                    };
                } else if(head.type === 'data') {
                    head.key += '.' + node.getDataKey();
                    return head;
                } else return false;
            } else if(node.isDeep) {
                if(head.type !== 'data') return false;
                let expression = null;
                if(ref.type === 'expression') expression = ref.expression;
                else if(ref.type === 'data') expression = Expression.fromNodeKey(ref.node, ref.key);
                else return false;
                let command = new NodeDataCommand(head.node.getData(), head.key || 'value', node.getDataKey(), expression);
                command.init();
                return command;
            } else {
                let headExpression = null, refExpression = null;
                if(head.type === 'expression') headExpression = head.expression;
                else if(head.type === 'data') headExpression = Expression.fromNodeKey(head.node, head.key);
                if(ref.type === 'expression') refExpression = ref.expression;
                else if(ref.type === 'data') refExpression = Expression.fromNodeKey(ref.node, ref.key);
                if(!headExpression || !refExpression) return false;
                let expression = Expression.fromPair(headExpression, node.getDataKey(), refExpression);
                return {type: 'expression', expression: expression};
            }
        };

        Map.prototype.setTentative = function(tentative) {
            let self = this;
            self.tentative = tentative;
            self.deepNodes.forEach(function(id) {
                let node = self.relation.findEntry('node', id);
                node.setTentative(self);
            });
            self.law.calculateDeepNodes();
        };



