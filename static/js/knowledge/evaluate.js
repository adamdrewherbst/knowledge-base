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

        *Symmetry*:

        Certain concepts, eg. sum, product, equality, are symmetric.  Within the tree rooted at a predicate node, if there
        is a symmetric node, we can flip its subtree relative to our relation, and if both orientations match, they give
        us two alternative submaps within the full map for that predicate node.

        So a given predicate map has 2^n alternative configurations where n is the number of symmetric nodes that matched
        in both orientations.  We make a separate map for each configuration.  Then we check all intersections with any of
        those 2^n maps.

        */


        /*
        assumes that matchId is a deep node of its description

        How do we determine if we have a full match, starting from a single deep node match?

        We have to trace the deep node back to its root matches, all the while checking if any
        ancestor node's other child gives us another node we need for a match.  If so, we add
        that child to the map we are building, and keep traversing down from that child.

        If an ancestor has no matching child, we are out of luck.  If it has multiple candidates,
        we can try each one in sequence.

        Before a child is added, its other parent must match, if necessary, and all of its children.
        We are only looking at children that have already been marked as matching the requisite node,
        so we don't have to check the other parent, just its children in turn.
        */
        Relation.prototype.fullMatch = function(nodeId, matchId) {

        };

        Relation.prototype.evaluate = function(opts) {

            let self = this;
            if(opts) self.options.evaluate = opts;

            $('#evaluate-msg').text('Evaluating...');
            self.syncGraph();
            self.law.evaluate();
            $('#evaluate-msg').text('Done evaluating');

            console.log('');
            console.log('Checked ' + self.stats.evaluate.nodesChecked + ' nodes');
            console.log('Created ' + self.nextMapId + ' maps');
            console.log('Appended ' + self.stats.evaluate.nodesAppended + ' nodes');
        };


        Relation.prototype.reset = function() {
            self.law.reset();
        };


        function Map(id) {
            this.id = id;
            this.relation = null;

            this.type = null;
            this.lawId = null;
            this.setId = null;
            this.idMap = {};
            this.deepNodes = [];
            this.valueMap = {};
            this.intersects = {};
            this.children = [];

            this.nodeId = null;
            this.matchId = null;
        }

        Map.prototype.addNode = function(node, predicate) {
            if(!node || !predicate) return false;

            this.idMap[node.id] = predicate.id;
            this.idMap[predicate.id] = node.id;

            if(!node.maps[predicate.id]) node.maps[predicate.id] = {};
            for(let mapId in node.maps[predicate.id]) this.intersections[mapId] = node.maps[predicate.id][mapId];
            node.maps[predicate.id][this.id] = this;

            for(let i = 0; i < 2; i++) {
                let nodeParent = node.getParent(i), predicateParent = predicate.getParent(i);
                if(!predicateParent) continue;
                if(!nodeParent || !this.addNode(nodeParent, predicateParent)) return false;
            }
            return true;
        };

        Map.prototype.merge = function(other) {
            let self = this, map = new Map();

            map.lawId = self.lawId;
            for(let n in self.idMap) {
                if(other.idMap.hasOwnProperty(n) && self.idMap[n] != other.idMap[n]) return false;
            }
            map.idMap = Object.assign({}, self.idMap, other.idMap);
            map.valueMap = Object.assign({}, self.valueMap, other.valueMap);
            map.intersects = Object.assign({}, self.intersects, other.intersects);
            map.deepNodes = [];
            for(let i = 0; i < 2; i++) {
                let currentMap = i == 0 ? self : other;
                currentMap.deepNodes.forEach(function(n) {
                    if(map.deepNodes.indexOf(n) < 0) map.deepNodes.push(n);
                });
            }
            map.children = [];

            return map;
        };


        Map.prototype.checkIntersections = function() {
            for(let mapId in this.intersections) {
                this.checkIntersection(this.intersections[mapId]);
            }
        };

        Map.prototype.checkIntersection = function(other) {

            let self = this, relation = self.relation;
            console.log('intersecting map ' + self.id + ' with ' + other.id);

            //make sure the two maps are for the same law, but their deep node sets are disjoint
            if(self.lawId != other.lawId) return false;
            let disjoint = self.deepNodes.every(function(n) {
                    return other.deepNodes.indexOf(n) < 0;
                });
            if(!disjoint) return false;

            //and that the joint deep node set is part of a set that satisfies the law
            let deepNodes = self.deepNodes.concat(other.deepNodes), match = null;
            let str1 = self.deepNodes.join(','), str2 = other.deepNodes.join(',');
            console.log('intersecting ' + str1 + ' with ' + str2);

            let cannotCombine = law.predicateSets.every(function(mset) {
                let isSubset = deepNodes.every(function(n) {
                    return mset.indexOf(n) >= 0;
                }), isMatch = false;
                if(isSubset) {
                    console.log('   subset');
                    //meanwhile, check if the deep nodes in the two maps in fact satisfy the law/set
                    isMatch = mset.every(function(m) {
                        return deepNodes.indexOf(m) >= 0;
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
            if(!map.include()) return false;

            //if the law has been satisfied, use the map to append the knowledge of the law to our relation
            if(match) {
                relation.appendLaw(self);
            } else {
                map.checkIntersections();
            }

            return true;
        };



        Map.prototype.checkMatch = function() {
            let self = this, relation = self.relation;
            let nodeId = self.nodeId, matchId = self.matchId;
            let node = relation.findEntry('node', nodeId),
                matchNode = relation.findEntry('node', matchId);

            //make sure the test node's concept is an instance of the match's concept
            if(!node.getConcept().instanceOf(matchNode.getConcept())) return false;

            self.idMap[nodeId] = matchId;
            self.idMap[matchId] = nodeId;

            //note any prior mappings between this node and predicate node - used later to test for intersections
            if(Map.nodeMap[nodeId] && Map.nodeMap[nodeId][matchId]) {
                for(let mapId in Map.nodeMap[nodeId][matchId])
                    self.intersects[mapId] = true;
            }

            //for symmetric nodes, make 2 submaps, one for each orientation
            let symmetric = node.getConcept().symmetric, fwdMap = map, revMap = map, fwd = true, rev = true;
            let nh = node.head, nr = node.reference, ph = match.head, pr = match.reference, twoMaps = false;
            if(symmetric && ((ph && nh) || (pr && nr))) {
                twoMaps = true;
                fwdMap = self.initChild();
                revMap = self.initChild();
            }

            //check recursively on this node's head and reference
            if(ph) fwd = fwd && nh && self.checkMatch(nh, ph, fwdMap);
            if(pr) fwd = fwd && nr && self.checkMatch(nr, pr, fwdMap);
            //for symmetric nodes, check the other orientation
            if(symmetric) {
                if(ph) rev = rev && nr && self.checkMatch(nr, ph, revMap);
                if(pr) rev = rev && nh && self.checkMatch(nh, pr, revMap);
                //if both succeed, keep the two alternatives as a pair of submaps
                if(fwd && rev) {
                    if(twoMaps) self.children.push([fwdMap, revMap]);
                }
                //if only one, absorb the corresponding submap into this map
                else if(fwd || rev) {
                    let keepMap = fwd ? fwdMap : revMap;
                    if(!self.absorb(keepMap)) return false;
                }
            } else rev = false;
            //and if neither direction worked, the predicate fails
            if(!fwd && !rev) return false;

            if(firstLevel) {
                //at this point we have a complete match to the predicate
                //separate all the forks on symmetric nodes into full maps
                let maps = self.split(), newMaps = 0, law = relation.findEntry('law', matchNode.law);
                console.log('node ' + nodeId + ' matches ' + law.name + ' on ' + matchId);
                console.log('   ' + maps.length + ' map versions');
                let satisfied = false;
                switch(self.type) {
                    case 'predicate':
                        satisfied = !law.predicateSets.every(function(pset) {
                            return !(pset.length == 1 && pset[0] == matchId);
                        });
                        break;
                    case 'set':
                        let rset = law.sets[self.setId];
                        satisfied = rset.length == 1 && rset[0] == matchId;
                        break;
                }
                if(satisfied) console.log('   satisfied');
                maps.forEach(function(map) {
                    if(!relation.includeMap(self)) return;
                    if(satisfied) {
                        relation.doSatisfied(self);
                    } else {
                        for(let other in map.intersects) {
                            self.checkIntersection(other);
                        }
                    }
                });
            }
            return true;
        };

        Map.prototype.initChild = function() {
            let child = new Map();
            child.type = this.type;
            child.setId = this.setId;
            child.deepNodes = this.deepNodes;
            return child;
        };


        Map.prototype.include = function() {
            let self = this, count = 0, id = Map.nextMapId;
            for(let n in self.idMap) {
                let p = self.idMap[n];
                if(!Map.nodeMap[n]) Map.nodeMap[n] = {};
                if(!Map.nodeMap[n][p]) Map.nodeMap[n][p] = {};
                if(!Map.nodeMap[p]) Map.nodeMap[p] = {};
                if(!Map.nodeMap[p][n]) Map.nodeMap[p][n] = {};
                Map.nodeMap[n][p][id] = true;
                count++;
            }
            if(count > 0) {
                self.id = id;
                Map.map[Map.nextMapId++] = self;
                return true;
            }
            return false;
        };


        Map.prototype.absorb = function(submap) {
            let self = this;
            for(let n in submap.idMap) {
                if(self.idMap.hasOwnProperty(n) && self.idMap[n] != submap.idMap[n]) return false;
                self.idMap[n] = submap.idMap[n];
            }
            for(let n in submap.value) self.value[n] = submap.value[n];
            for(let m in submap.intersects) self.intersects[m] = submap.intersects[m];
            self.children = self.children.concat(submap.children);
        };

        /*
        From every symmetric node, there are two possible maps.
        */
        Map.prototype.split = function() {
            let self = this, maps = [];

            map.children.forEach(function(pair) {
                let submaps = pair[0].split().concat(pair[1].split());
                submaps.forEach(function(submap) {
                    let merge = self.merge(submap);
                    if(merge) maps.push(merge);
                });
            });

            if(maps.length == 0) maps.push(self);

            return maps;
        };


        //given a correspondence between nodes in the relation and predicate, fill in the rest of the law
        Relation.prototype.appendLaw = function(map) {

            var self = this;

            //update our relation with all value intersections calculated during the mapping
            for(let node in map.value) {
                //self.nodes[node].value = map.value[node];
            }

            //start at each deep node of the law
            var law = self.laws[map.lawId];
            console.log('appending ' + law.name);
            law.deepNodes.forEach(function(nodeId) {
               let newId = self.appendLawHelper(map, nodeId);
               if(newId == null) {
                   console.err("couldn't append deep node " + nodeId + ' [' + self.nodes[nodeId].getConcept().name + ']');
               }
            });

            map.satisfied = true;
            map.tentative = self.options.evaluate.tentative || false;
        };

        Relation.prototype.appendLawHelper = function(map, nodeId) {

            if(map.idMap.hasOwnProperty(nodeId)) return map.idMap[nodeId];

            let self = this, node = self.nodes[nodeId], head = node['head'], reference = node['reference'],
                newHead = null, newReference = null;
            let tentative = self.options.evaluate.tentative || false;

            //if the head and reference of this node haven't been appended yet, do that first
            newHead = self.appendLawHelper(map, head);
            if(newHead == null) return null;
            if(reference) {
                newReference = self.appendLawHelper(map, reference);
                if(newReference == null) return null;
            }

            //if the head and reference are already related by this concept, don't add the node
            //...unless we are only appending knowledge tentatively, in which case we need to distinguish
            //which law each tentative node came from
            if(!tentative) {
                for(let child in self.nodes[newHead].children) {
                    if(self.nodes[child].concept == node.concept && self.nodes[child].reference == newReference) {
                        return child;
                    }
                }
            }

            let newId = self.addNode({
                'law': self.law.id,
                'concept': node['concept'],
                'head': parseInt(newHead),
                'reference': newReference ? parseInt(newReference) : null,
                'value': self.nodes[nodeId].value,
                'tentative': tentative,
                'appended': true
            });
            self.law.nodes.push(newId);
            self.stats.evaluate.nodesAppended++;

            map.idMap[nodeId] = newId;
            map.idMap[newId] = nodeId;

            if(!tentative) {
                self.drawNode(newId, {
                    template: 'appended',
                    drawLinks: true
                });
            }
            return newId;
        };


        Relation.prototype.addNode = function(data) {
            let self = this, newId = self.nextNodeId;
            self.nextNodeId++;
            let node = self.nodes[newId] = self.createEntry('node', data);
            node.id = newId;
            node.setHead(node.head);
            node.setReference(node.reference);
            if(!node.tentative) node.addToEvaluateQueue();
            return newId;
        };


