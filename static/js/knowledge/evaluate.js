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


        Node.prototype.evaluate = function() {
            let self = this;

            // identify the top context nodes of this relation
            let queue = self.getTopNodes();

            // for each such top node C
            while(!queue.isEmpty()) {

                let part = queue.first();
                // take every law predicate C is 'in'
                node.eachOutgoing(['in', 'predicate'], function(predicate) {

                    // look for all matches to P within R
                    let map = new Map(self, predicate);
                    map.map(node, node);
                    map.extend();
                });

                part.eachIncoming('is a', function(link) {
                    queue.push(link);
                });
            });
        };


        function Map(relation, predicate) {

            this.relation = relation;
            this.predicate = predicate;

            this.law = predicate.getOutgoing(['of', 'law'])[0];
            this.lawSet = law.getIncoming(['in', '*']);
            this.predicateSet = predicate.getIncoming(['in', '*']);

            this.map = {};
            this.waiting = {};
            this.predicateComplete = false;
        }
        Map.nextId = 1;

        Map.prototype.getId = function() {
            return this.id;
        };

        Map.prototype.inLaw = function(lawPart) {
            return this.lawSet.includes(lawPart);
        };
        Map.prototype.inPredicate = function(lawPart) {
            return this.predicateSet.includes(lawPart);
        };

        Map.prototype.map = function(part, lawPart) {
            let self = this, lid = lawPart.getId();

            // make sure this concept hasn't already been matched to a different predicate
            if(self.map.hasOwnProperty(lid) && self.map[lid] !== part) return false;

            // see if this match has already been added to this map
            if(self.map[lid] === part) return true;

            // mark the pair as matching
            self.map[lid] = part;

            // prioritize which neighbors of the matched part should be matched next
            lawPart.eachNeighbor(function(lawNeighbor, lawDirection) {

                // only neighbors that are within the law
                if(!self.inLaw(lawNeighbor)) return;

                // if this neighbor is already matched, make sure the connection is mirrored in the relation
                let neighbor = self.getMatch(lawNeighbor);
                if(neighbor) return neighbor.isNeighbor(part, lawDirection);

                let neighborInPredicate = predicateSet.includes(neighbor.getId()),
                    neighborRequired = self.predicateComplete || neighborInPredicate,
                    priority = -1;

                // first, links between parts that have already been matched
                if(lawNeighbor.isLink() && self.hasMatch(lawNeighbor.getEndpoint(lawDirection))) {
                    priority = neighborRequired ? 0 : 1;
                // then, neighbors that extend the current match
                } else {
                    priority = neighborInPredicate ? 2 : 3;
                }

                self.waiting[neighbor.getId()] = {
                    part: lawNeighbor,
                    priority: priority,
                    from: lawPart,
                    direction: lawDirection
                };
            });
            return true;
        };

        Map.prototype.extend = function() {
            let self = this;

            // find the highest priority part waiting to be matched
            let best = null;
            $.each(self.waiting, function(entry) {
                if(!best || entry.priority < best.priority) best = entry;
            });

            // if nothing left to match, register this map
            if(!best) {
                self.register();
                return;
            }

            // try to find a match for this part
            let part =

            // try to extend the map from every waiting part
            while(self.queue.length > 0) {

                // get the first node/link waiting to be extended - call it X, and its match in the law Xl
                let lawPart = self.queue[0], part = self.getMatch(lawPart);

                // for each of Xl's neighbors Nl in the predicate graph
                let valid = lawPart.eachNeighbor(function(lawNeighbor, lawDirection) {

                    // if this is a link outside the law, make sure its other end is part of the law
                    if(!self.inLaw(lawNeighbor)) return;

                    // if Np has already been matched to some part N, then
                    // N should connect to X in the same way that Nl connects to Xl

                    // otherwise, try all ways of adding a neighbor N that matches Nl
                    let found = false;
                    part.eachNeighbor(function(neighbor, direction) {
                        let match = direction === lawDirection &&
                            (neighbor.isNode() || neighbor.getConcept() === lawNeighbor.getConcept());
                        if(match) {
                            let newMap = self.clone();
                            newMap.map(neighbor, lawNeighbor);
                            newMap.extend();
                            found = true;
                        }
                    });

                    // if no match was found for the Nl, then we can rule out any predicate that requires it
                    if(!found) {
                        lawNeighbor.eachOutgoing('in', 'predicate', function(predicate) {
                            delete self.predicatePossible[predicate.getId()];
                        });
                        if(Object.keys(self.predicatePossible).length === 0) {
                            return false;
                        }
                    }
                });
                if(!valid) return false;

                self.queue.shift();
            }

            //nothing left to do, so see if we match any predicate of the law
            let match = !self.predicateSets.every(function(predicateSet) {
                return !predicateSet.every(function(part) {
                    return self.hasMatch(part);
                });
            });
            if(match) {
                console.log('matches law ' + self.law.getName());
            }
        };

        Map.prototype.hasMatch = function(lawPart) {
            return this.map.hasOwnProperty(lawPart.getId());
        };

        Map.prototype.getMatch = function(lawPart) {
            return this.map[lawPart.getId()];
        };

        Map.prototype.eachPair = function(callback) {
            let self = this;
            for(let id in self.map) {
                let concept = Concept.get(id), predicate = Concept.get(self.idMap[id]);
                if(concept.getLaw() !== self.law) {
                    if(callback.call(self, concept, predicate) === false) return false;
                }
            }
            return true;
        };

        Map.prototype.check = function() {
            let self = this;
        };

        Map.prototype.clone = function() {
            let map = Object.assign({}, this);
            map.from[this.id] = this;
        };

        Map.prototype.append = function() {
        };

        Map.prototype.setTentative = function(tentative) {
        };



