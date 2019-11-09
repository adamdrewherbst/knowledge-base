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


        Concept.prototype.evaluate = function(top) {
            let self = this;
            if(self.evaluated()) return;

            if(self !== top) {
                self.getContext().forEach(function(concept) {
                    concept.evaluate(top);
                });
            }

            Concept.getLawConcepts(self).forEach(function(concept) {
                self.match(concept);
            });

            self.getChildren().forEach(function(concept) {
                concept.evaluate(top);
            });

            if(self === top) {
                Map.eachMap(function(map) {
                    map.check();
                });
            }
        };

        Concept.prototype.match = function(concept) {
            let self = this, law = concept.getLaw();

            // create the list of matches between my context links and those of the law concept
            let linkMatches = [];
            let match = concept.getContextLinks().every(function(link) {
                let end = link.end();
                if(!end.inLaw(law)) return self.hasLink(link.type(), end));
                self.getContextLinks().forEach(function(myLink) {
                    if(!myLink.end().matched(end)) return;
                    linkMatches.push([myLink, link]);
                });
                return true;
            });
            if(!match) return false;

            // determine which of those matches are compatible with which
            let compatible = {};
            linkMatches.forEach(function(match1, i) {
                linkMatches.forEach(function(match2, j) {
                    if(i >= j) return;
                    if(match1[0] !== match2[0] && match1[1] !== match2[1]) {
                        Misc.setIndex(compatible, i, j, true);
                        Misc.setIndex(compatible, j, i, true);
                    }
                });
            });

            // find all maximal compatible sets of link matches
            let P = [], X = [], R = [], sets = [];
            for(let i = 0; i < linkMatches.length; i++) P[i] = i;
            self.bronKerbosch(R, P, X, compatible, sets);

            // see which sets would give us a valid map
            sets.forEach(function(matchSet) {
                // for each link in the set, consider all maps in which my end matches the link end
                self.testMapSets(concept, matchSet, {});
            });
        };

        Concept.prototype.bronKerbosch = function(R, P, X, neighbors, sets) {
            let self = this;
            if(P.length === 0) {
                if(X.length === 0)
                    sets.push(R);
                return;
            }
            while(P.length > 0) {
                let next = P.pop(), newR = Object.assign({}, R);
                newR.push(next);
                self.bronKerbosch(newR,
                P.filter(function(p) {
                    return neighbors[p][next];
                }), X.filter(function(x) {
                    return neighbors[x][next];
                }), neighbors, sets);
                X.push(next);
            }
        };

        Concept.prototype.testMapSets = function(concept, matchSet, mapSet) {
            let self = this;

            if(matchSet.length === 0) {
                let map = new Map();
                map.map(self, concept);
                for(let id in mapSet) {
                    if(!map.merge(mapSet[id]))
                        return false;
                }
                map.register();
            }

            let linkMatch = matchSet.pop(), myLink = linkMatch[0], link = linkMatch[1];
            myLink.end().getMaps(link.end()).forEach(function(map) {
                mapSet[myLink.getId()] = map;
                self.testMapSets(matchSet, mapSet);
            });
        };

        Concept.prototype.addMatch = function(concept) {
            let self = this;
            self.matches[concept.getId()] = concept;
        };

        Concept.prototype.matched = function(concept) {
            return this.matches[concept.getId()] ? true : false;
        };


        function Map() {
            this.idMap = {};
            this.intersections = {};
            this.principal = true;
            this.principalMaps = {};
            this.principalMaps[this.id] = this;
        }
        Map.nextId = 1;

        Map.prototype.register = function() {
            this.id = Map.nextId++;
            Map.maps[this.id] = this;

            for(let m in this.principalMaps) {
                delete this.intersections[m];
            }
            this.checkIntersections();
        };

        Map.prototype.map = function(concept, predicate) {
            let self = this;
            if(!concept || !predicate) return false;

            let cid = concept.getId(), pid = predicate.getId();

            // make sure this concept hasn't already been matched to a different predicate
            if(self.idMap.hasOwnProperty(cid) && self.idMap[cid] !== pid) return false;

            // see if this match has already been added to this map
            if(self.idMap[cid] === pid && self.idMap[pid] === cid) return true;

            console.log('adding concept ' + cid + ' to map ' + this.id + ' as ' + predicate.toString());

            // mark the pair as matching
            self.idMap[cid] = pid;

            // if any other maps already contain this matching pair, mark this map as intersecting
            // with those maps; later they will be checked to see if they fully intersect (see checkIntersection below)
            if(!concept.maps[pid]) concept.maps[pid] = {};
            for(let mapId in concept.maps[pid]) {
                self.intersections[mapId] = concept.maps[pid][mapId];
            }
            // store in the node the match to this predicate node in this map
            concept.maps[pid][self.id] = self;
            return true;
        };

        Map.prototype.merge = function(other) {
            let self = this;
            return other.eachPair(function(concept, predicate) {
                return self.map(concept, predicate);
            });
        };

        Map.prototype.eachPair = function(callback) {
            let self = this;
            for(let id in self.idMap) {
                let concept = Concept.get(id), predicate = Concept.get(self.idMap[id]);
                if(concept.getLaw() !== self.law) {
                    if(callback.call(self, concept, predicate) === false) return false;
                }
            }
            return true;
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

            for(let m in self.principalMaps) {
                if(other.principalMaps.hasOwnProperty(m)) return false;
            }

            let map = Object.assign({}, self);
            if(!map.merge(other)) return false;
            Object.assign(map.principalMaps, other.principalMaps);
            map.register();
            return true;
        };

        Map.prototype.check = function() {
            let self = this;
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



