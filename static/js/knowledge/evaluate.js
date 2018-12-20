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

        Relation.prototype.evaluate = function(opts) {

            let self = this;
            if(opts) self.options.evaluate = opts;
            opts = self.options.evaluate;

            $('#evaluate-msg').text('Evaluating...');
            self.syncGraph();
            self.nodesToCheck = [];
            self.law.nodes.forEach(function(nodeId) {
                let node = self.nodes[nodeId];
                if(node && !node.evaluated[opts.tag || 'all']) self.nodesToCheck.push(nodeId);
            });

            self.stats.evaluate.nodesChecked = 0;
            self.stats.evaluate.nodesAppended = 0;

            while(self.nodesToCheck.length > 0) {
               //find any deep predicate nodes in included frameworks
               //that have the same concept as this node
               let nodeId = self.nodesToCheck.shift(), node = self.nodes[nodeId], concepts = node.getConcept().getAllConcepts();
               if(node.tentative) continue;
               console.log('checking node ' + nodeId);
               for(let concept in concepts) {
                   if(!self.predicates.hasOwnProperty(concept)) continue;
                   for(let predicateId in self.predicates[concept]) {
                       let predicateNode = self.nodes[predicateId];
                       if(node.law == predicateNode.law) continue;
                       let law = self.findEntry('law', predicateNode.law);
                       if(law.hasTag('inactive')) continue;
                       if(opts.frameworks && opts.frameworks.indexOf(law.framework) < 0) continue;
                       if(opts.useLaw && !opts.useLaw.call(self, law)) continue;
                       if(opts.tag && !law.hasTag(opts.tag)) continue;
                       else if(!opts.tag && (law.hasTag('visualization'))) continue;
                       console.log('node ' + nodeId + ' matches ' + predicateId + ' in ' + law.name + ' [' + law.id + ']');
                       self.checkPredicate(nodeId, predicateId);
                   }
               }
               node.evaluated[opts.tag || 'all'] = true;

               self.stats.evaluate.nodesChecked++;

               if(self.nextMapId > 100) {
                   console.log('');
                   console.error('TOO MANY MAPS - ABORTING');
                   break;
               }
            }
            if(opts.propagate) {
                for(let type in opts.propagate) self.law.propagateData(type);
            }
            $('#evaluate-msg').text('Done evaluating');
            console.log('');
            console.log('Checked ' + self.stats.evaluate.nodesChecked + ' nodes');
            console.log('Created ' + self.nextMapId + ' maps');
            console.log('Appended ' + self.stats.evaluate.nodesAppended + ' nodes');
        };


        Relation.prototype.clearMaps = function() {
            let self = this;
            for(let m in self.map)
                delete self.map[m];
            self.nextMapId = 0;
            self.nodesToCheck = [];
            self.nodeMap = {};
            self.tempIdMap = null;
            for(let n in self.nodes) {
                if(self.nodes[n].appended)
                    self.nodes[n].remove();
                else self.nodes[n].evaluated = {};
            }
        };


        //see if the relation matches the predicate by recursively tracing the law up to its wildcards
        Relation.prototype.checkPredicate = function(nodeID, predicateID, map) {

            let self = this, nodeId = parseInt(nodeID), predicateId = parseInt(predicateID),
                node = this.nodes[nodeId], predicate = this.nodes[predicateId];

            //if this is the first recursion step, initialize aggregators
            let firstLevel = !map;
            if(firstLevel) {
                map = {lawId: predicate['law'], predicates: [predicateId], idMap: {}, value: {}, intersects: {}, children: []};
            }

            //make sure at least one of this node's associated concepts matches the predicate's concept
            let match = predicate.concept == self.wildcardConcept
                || node.concept == predicate.concept
                || self.concepts[node.concept].dependencies[predicate.concept]
            if(!match && self.concepts[node.concept].inherits && node.head > 0 && self.nodes.hasOwnProperty(node.head)) {
                let headConcept = self.nodes[node.head].concept;
                if(headConcept > 0){
                    match = headConcept == predicate.concept
                            || self.concepts[headConcept].dependencies[predicate.concept];
                }
            }
            //and find the intersection of any values on the two nodes
            let value = null;
            if(match) value = node.value; //.intersect(predicate.values);
            if(!match) return false; // || (value && value.length == 0)) return false;

            map.idMap[nodeId] = predicateId;
            map.idMap[predicateId] = nodeId;
            map.value[nodeId] = value;

            //note any prior mappings between this node and predicate node - used later to test for intersections
            if(self.nodeMap.hasOwnProperty(nodeId) && self.nodeMap[nodeId].hasOwnProperty(predicateId)) {
                for(let mapId in self.nodeMap[nodeId][predicateId]) {
                    map.intersects[mapId] = true;
                }
            }

            //for symmetric nodes, make 2 submaps, one for each orientation
            let symmetric = self.concepts[node.concept].symmetric, fwdMap = map, revMap = map, fwd = true, rev = true;
            let nh = node.head, nr = node.reference, ph = predicate.head, pr = predicate.reference, twoMaps = false;
            if(symmetric && ((ph && nh) || (pr && nr))) {
                twoMaps = true;
                fwdMap = {lawId: predicate.law, predicates: [predicateId], idMap: {}, value: {}, intersects: {}, children: [], parent: map};
                revMap = {lawId: predicate.law, predicates: [predicateId], idMap: {}, value: {}, intersects: {}, children: [], parent: map};
            }

            //check recursively on this node's head and reference
            if(ph) fwd = fwd && nh && self.checkPredicate(nh, ph, fwdMap);
            if(pr) fwd = fwd && nr && self.checkPredicate(nr, pr, fwdMap);
            //for symmetric nodes, check the other orientation
            if(symmetric) {
                if(ph) rev = rev && nr && self.checkPredicate(nr, ph, revMap);
                if(pr) rev = rev && nh && self.checkPredicate(nh, pr, revMap);
                //if both succeed, keep the two alternatives as a pair of submaps
                if(fwd && rev) {
                    if(twoMaps) map.children.push([fwdMap, revMap]);
                }
                //if only one, absorb the corresponding submap into this map
                else if(fwd || rev) {
                    let keepMap = fwd ? fwdMap : revMap;
                    if(!self.absorbMap(map, keepMap)) return false;
                }
            } else rev = false;
            //and if neither direction worked, the predicate fails
            if(!fwd && !rev) return false;

            if(firstLevel) {
                //at this point we have a complete match to the predicate
                //separate all the forks on symmetric nodes into full maps
                let maps = self.splitMaps(map), newMaps = 0, law = self.laws[predicate.law];
                console.log('node ' + nodeId + ' matches ' + law.name + ' on ' + predicateId);
                console.log('   ' + maps.length + ' map versions');
                let satisfied = !law.predicateSets.every(function(pset) {
                    return !(pset.length == 1 && pset[0] == predicateId);
                });
                if(satisfied) console.log('   satisfied');
                maps.forEach(function(map) {
                    if(!self.includeMap(map)) return;
                    if(satisfied) {
                        self.appendLaw(map);
                    } else {
                        for(let other in map.intersects) {
                            self.checkIntersection(map.id, other);
                        }
                    }
                });
            }
            return true;
        };


        Relation.prototype.includeMap = function(map) {
            let self = this, count = 0, id = self.nextMapId;
            for(let n in map.idMap) {
                let p = map.idMap[n];
                if(!self.nodeMap.hasOwnProperty(n)) self.nodeMap[n] = {};
                if(!self.nodeMap[n].hasOwnProperty(p)) self.nodeMap[n][p] = {};
                if(!self.nodeMap.hasOwnProperty(p)) self.nodeMap[p] = {};
                if(!self.nodeMap[p].hasOwnProperty(n)) self.nodeMap[p][n] = {};
                self.nodeMap[n][p][id] = true;
                count++;
            }
            if(count > 0) {
                map.id = id;
                self.map[self.nextMapId++] = map;
                return true;
            }
            return false;
        };


        Relation.prototype.absorbMap = function(map, submap) {
            let self = this;
            for(let n in submap.idMap) {
                if(map.idMap.hasOwnProperty(n) && map.idMap[n] != submap.idMap[n]) return false;
                map.idMap[n] = submap.idMap[n];
            }
            for(let n in submap.value) map.value[n] = submap.value[n];
            for(let m in submap.intersects) map.intersects[m] = submap.intersects[m];
            map.children = map.children.concat(submap.children);
        };

        /*
        From every symmetric node, there are two possible maps.
        */
        Relation.prototype.splitMaps = function(map) {
            let self = this, maps = [];

            map.children.forEach(function(pair) {
                let submaps = self.splitMaps(pair[0]).concat(self.splitMaps(pair[1]));
                submaps.forEach(function(submap) {
                    let merge = self.mergeMaps(map, submap);
                    if(merge) maps.push(merge);
                });
            });

            if(maps.length == 0) maps.push(map);

            return maps;
        }


        Relation.prototype.mergeMaps = function(map1, map2) {
            let self = this, map = {};

            map.lawId = map1.lawId;
            for(let n in map1.idMap) {
                if(map2.idMap.hasOwnProperty(n) && map2.idMap[n] != map1.idMap[n]) return false;
            }
            map.idMap = Object.assign({}, map1.idMap, map2.idMap);
            map.value = Object.assign({}, map1.value, map2.value);
            map.intersects = Object.assign({}, map1.intersects, map2.intersects);
            map.predicates = [];
            for(let i = 0; i < 2; i++) {
                let currentMap = i == 0 ? map1 : map2;
                currentMap.predicates.forEach(function(p) {
                    if(map.predicates.indexOf(p) < 0) map.predicates.push(p);
                });
            }
            map.children = [];

            return map;
        };


        Relation.prototype.checkIntersection = function(mapId1, mapId2) {

            let self = this, map1 = self.map[mapId1], map2 = self.map[mapId2];
            console.log('intersecting map ' + mapId1 + ' with ' + mapId2);

            //make sure the two maps are for the same law, but their predicate sets are disjoint
            if(map1.lawId != map2.lawId) return false;
            let disjoint = map1.predicates.every(function(predicate) {
                    return map2.predicates.indexOf(predicate) < 0;
                });
            if(!disjoint) return false;

            //and that the joint predicate set is part of a set that satisfies the law
            let law = self.laws[map1.lawId], predicateSet = map1.predicates.concat(map2.predicates), match = null;
            let predicates1 = map1.predicates.join(','), predicates2 = map2.predicates.join(',');
            console.log('intersecting ' + predicates1 + ' with ' + predicates2 + ' for ' + law.name);
            console.log('   requires: ' + JSON.stringify(law.predicateSets));
            let cannotCombine = law.predicateSets.every(function(pset) {
                let isSubset = predicateSet.every(function(predicate) {
                    return pset.indexOf(predicate) >= 0;
                }), isMatch = false;
                if(isSubset) {
                    console.log('   subset');
                    //meanwhile, check if the predicates in the two maps in fact satisfy the law
                    isMatch = pset.every(function(predicate) {
                        return predicateSet.indexOf(predicate) >= 0;
                    });
                    if(isMatch) {
                        match = pset;
                        console.log('   match');
                    }
                }
                return !isSubset && !isMatch;
            });
            if(match == null && cannotCombine) {
                console.log('   predicate failure');
                return false;
            }

            //whichever relation nodes are shared by the two maps must be mapped to the same predicate node
            for(let node in map1.idMap) {
                if(!map2.idMap.hasOwnProperty(node)) continue;
                if(map2.idMap[node] != map1.idMap[node]) return false;
            }
            console.log('   success');

            //at this point they do intersect, so create a new map by merging these two
            let map = self.mergeMaps(map1, map2);
            if(!self.includeMap(map)) return false;

            //if the law has been satisfied, use the map to append the knowledge of the law to our relation
            if(match) {
                self.appendLaw(map);
            }

            return true;
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

            //same process for the reference node
            if(reference) {
                if(self.concepts[node.concept].symmetric) {
                    if(!tentative) {
                        for(let child in self.nodes[newReference].children) {
                            if(self.nodes[child].concept == node.concept && self.nodes[child].reference == newHead) {
                                return child;
                            }
                        }
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

            if(!tentative) self.nodesToCheck.push(newId);
            map.idMap[nodeId] = newId;
            map.idMap[newId] = nodeId;

            if(!tentative) self.drawNode(newId, {
                template: 'appended',
                drawLinks: true
            });
            return newId;
        };


        Relation.prototype.addNode = function(data) {
            let self = this, newId = self.nextNodeId;
            self.nextNodeId++;
            let node = self.nodes[newId] = self.createEntry('node', data);
            node.id = newId;
            node.setHead(node.head);
            node.setReference(node.reference);
            return newId;
        };


