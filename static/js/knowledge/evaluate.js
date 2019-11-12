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
            let self = this, top = top || this;
            if(self.evaluated) return;

            if(self !== top) {
                self.eachContext(function(context) {
                    context.evaluate(top);
                });
            }

            //create a new map for each top-level law concept I match
            self.eachInstanceOf(function(concept) {
                concept.eachLawTop(function(instance) {
                    if(self.instanceOf(instance)) {
                        new Map().map(self, instance);
                    }
                });
            });

            // for every map my context concepts are part of,
            // see if I can be added to that map
            let newMaps = [];
            self.eachContext(function(context) {
                context.eachMap(function(map) {
                    map.getMatch(context).eachContextOf(function(contextOf) {
                        if(self.instanceOf(contextOf)) {
                            let newMap = map.clone();
                            newMap.map(self, contextOf);
                            newMap.register();
                            newMaps.push(newMap);
                        }
                    });
                });
            });
            //then see if any of those maps can be combined with each other
            while(newMaps.length > 0) {
                let m1 = newMaps.pop();
                newMaps.forEach(function(m2) {
                    let merge = m1.clone().merge(m2);
                    if(merge) {
                        merge.register();
                        newMaps.push(merge);
                    }
                });
            }
            self.evaluated = true;

            self.eachContextOf(function(contextOf) {
                contextOf.evaluate(top);
            });
        };

        Concept.prototype.addMap = function(map) {
            this.maps[map.getId()] = map;
        };


        function Map() {
            this.idMap = {};
            this.from = {};
        }
        Map.nextId = 1;

        Map.prototype.getId = function() {
            return this.id;
        };

        Map.prototype.register = function() {
            let self = this;
            self.id = Map.nextId++;
            self.eachPair(function(concept, predicate) {
                concept.addMap(self);
            });
        };

        Map.prototype.map = function(concept, predicate) {
            let self = this;
            if(!concept || !predicate) return false;

            let cid = concept.getId(), pid = predicate.getId();

            // make sure this concept hasn't already been matched to a different predicate
            if(self.idMap.hasOwnProperty(cid) && self.idMap[cid] !== pid) return false;

            // see if this match has already been added to this map
            if(self.idMap[cid] === pid && self.idMap[pid] === cid) return true;

            // mark the pair as matching
            self.idMap[cid] = pid;
            return true;
        };

        Map.prototype.getMatch = function(concept) {
            return Concept.get(this.idMap[concept.getId()]);
        };

        Map.prototype.merge = function(other) {
            let self = this;
            if(self.from[other.getId()]) return false;
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



