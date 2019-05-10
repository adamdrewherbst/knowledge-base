        /*

        RELATION EVALUATION:

        Scheme: Start with the problem graph.  Iterate over all nodes in breadth-first fashion - that is, make sure the list
        of nodes is such that each child is behind its parents in the list.  For each node, check if it matches a
        'top predicate node' - ie. a node that has no parents, from the predicate of any law in the framework we are using.
        Store all such matches.  Then, check if it matches a non-top predicate node whose parents have already matched
        its parents.  This gives us a match between a triad (head-child-reference) in our law and a triad in the predicate
        of another law.  In this way we may eventually match a 'deep predicate node', a predicate node whose children are not
        part of the predicate.  When we do so, we create a map between the predicate node and its ancestors, and the matching
        node with its matching ancestors.

        This file defines the Map prototype to store these matches.

        If two maps for same law, different predicate nodes, are found to intersect, we create a new map which is the union
        of those two.  By merging maps whenever they intersect, we may eventually get a map that contains an entire predicate
        set of the law.  Then we can apply the law to our problem graph.

        */


        // perform the evaluation on our relation, to find out what if any laws can be applied to it
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


        // reset the relation to its state before any evaluation was performed
        Relation.prototype.reset = function() {
            this.law.reset();
            Dependency.clearCommands();
            $('#suggestion-wrapper').empty();
            $('#symbolization-wrapper').empty();
        };

        // get the descriptive tag for the current round of evaluation; we will not re-evaluate a node
        // for the same tag twice (unless it is reset with the 'reset' function above), but if the tag is
        // changed and then we re-evaluate the relation, the node will be re-evaluated too.
        // The default is an empty '' tag.
        Relation.prototype.getEvaluateTag = function() {
            return Misc.getIndex(this.options, 'evaluate', 'tag') || '';
        };


        // a wrapper class for the map which stores a matching between predicate nodes from a certain law,
        // and nodes from our relation
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

        // add to this map a matching between the given relation node and predicate node;
        // because of the way matching is checked (see Node.prototype.updateMatches in databaseWrappers.js),
        // we also know that the node's parents match the predicate's parents, so we add those matching pairs
        // to the map recursively.
        Map.prototype.addNode = function(node, predicate) {
            let self = this;
            if(!node || !predicate) return false;

            // first see if this match has already been added to this map
            if(self.idMap[node.id] === predicate.id && self.idMap[predicate.id] === node.id) return true;

            console.log('adding node ' + node.id + ' to map ' + this.id + ' as ' + predicate.toString());

            // mark the pair as matching
            self.idMap[node.id] = predicate.id;
            self.idMap[predicate.id] = node.id;

            // if any other maps already contain this matching pair, mark this map as intersecting
            // with those maps; later they will be checked to see if they fully intersect (see checkIntersection below)
            if(!node.maps[predicate.id]) node.maps[predicate.id] = {};
            for(let mapId in node.maps[predicate.id]) {
                self.intersections[mapId] = node.maps[predicate.id][mapId];
            }
            // store in the node the match to this predicate node in this map
            node.maps[predicate.id][self.id] = self;

            // recursively add the matches between this node's parents and the predicate node's parents
            for(let i = 0; i < 2; i++) {
                let nodeParent = node.getParent(i), predicateParent = predicate.getParent(i);
                if(!predicateParent) continue;
                if(!nodeParent || !self.addNode(nodeParent, predicateParent)) return false;
            }
            return true;
        };

        // once two maps have been found to fully intersect via checkIntersection below,
        // create a new map consisting of the union of these two maps
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

            // now that we've created the merged map, we don't need to re-check the intersection
            // between the original 2 maps
            delete map.intersections[self.id];
            delete map.intersections[other.id];

            return map;
        };

        // for every map that has at least one node-predicate matching in common with this one,
        // check to see if the two maps fully intersect
        Map.prototype.checkIntersections = function() {
            let self = this;
            for(let mapId in this.intersections) {
                self.checkIntersection(self.intersections[mapId]);
            }
        };

        // see whether two maps fully intersect; that is, every predicate node that is in either map is matched
        // with the same node from our relation.  If so, we merge them into a new joint map, while keeping the original maps
        // so they can be merged with other maps
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

        // given a correspondence between nodes in the relation and predicate, fill in the rest of the law
        // (ie. create new nodes in our relation corresponding to the non-predicate nodes of the law)
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

        // while applying a law, add a new node to our relation corresponding to the predicate node given by nodeId;
        // if the predicate node's parents have not been appended yet, we do this first, recursively
        Map.prototype.appendNode = function(nodeId) {

            let self = this, law = self.law, relation = self.relation;

            // if this predicate node has already been added to our relation, nothing to do
            if(self.idMap.hasOwnProperty(nodeId)) return relation.findEntry('node', self.idMap[nodeId]);

            // get the parents of the predicate node to make sure they've been added first
            let node = relation.findEntry('node', nodeId), head = node.head, reference = node.reference,
                newHead = null, newReference = null;

            // this global option determines whether appended knowledge will be considered tentative
            let tentative = relation.options.evaluate.tentative || false;

            //if the parents haven't been added yet, we need those first, so that we have something to connect this node to
            if(head) {
                newHead = self.appendNode(head);
                if(newHead == null) return null;
            }
            if(reference) {
                newReference = self.appendNode(reference);
                if(newReference == null) return null;
            }

            // if the head and reference are already related by this concept, don't add the node - two nodes can only
            // be related by one instance of a given concept - eg. to have two forces between the same pair of bodies,
            // we need to specify the concept 'force' further for each instance
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
                // if the existing child was appended by another map, then we'll add ourself to the list of its sources;
                // that way, if all of those source maps are later removed, the child will be deleted when the last map is;
                // but, if the child was part of the original relation (not from any map), it should never be deleted except by the user
                if(Object.keys(childMatch.fromMap).length > 0)
                    childMatch.addFromMap(self);
                return childMatch;
            }

            // create the new node
            let newNode = law.addNode({
                'law': law.id,
                'concept': node.concept,
                'head': newHead ? parseInt(newHead) : null,
                'reference': newReference ? parseInt(newReference) : null,
                'value': node.value,
                'appended': true,
            }), newId = newNode.getId();

            // mark the new node as having been added by this map, and give it the same tentative status as the map has
            newNode.addFromMap(self);
            newNode.setTentative(self);

            relation.stats.evaluate.nodesAppended++;

            // mark this new node as corresponding to the given predicate node, and vice versa
            self.idMap[nodeId] = newId;
            self.idMap[newId] = nodeId;

            return newNode;
        };

        // mark this map as tentative or not.  Each node in the map will be marked tentative if it is
        // not part of the original relation or part of a non-tentative map.
        Map.prototype.setTentative = function(tentative) {
            let self = this;
            self.tentative = tentative;
            // only mark our deep nodes as tentative/not tentative, as these will recursively
            // do the same to their parents.
            self.deepNodes.forEach(function(id) {
                let node = self.relation.findEntry('node', id);
                node.setTentative(self);
            });
            // if the map is now tentative, its deep nodes are no longer deep nodes of the law,
            // so we need to re-check which are the law's deep nodes now
            self.law.calculateDeepNodes();
        };



