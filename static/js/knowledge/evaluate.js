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


        Part.prototype.prepEvaluate = function() {
            let self = this;
            self.evaluateQueue = [];

            self.each(['<', Concept.in, '*'], function(member) {
                member.eachLink(function(link, dir, neighbor) {
                    if(neighbor !== self && !neighbor.has(['>',Concept.in,self])) {
                        self.evaluateQueue.push(neighbor);
                    }
                });
            });
        };


        Part.prototype.evaluate = function(steps) {
            let self = this;
            if(!self.evaluateQueue) self.prepEvaluate();
            if(!Page.displayedMap) {
                let part = self.evaluateQueue.pop();
                let map = new Map(self);
                map.match(part, part);
                if(!isNaN(steps)) steps--;
            }
            Page.displayedMap.extend(steps);
        };


        Part.prototype.resetEvaluate = function() {
            this.evaluateQueue = [];
        };


        function prep() {
            e(1).node.prepEvaluate();
        }
        function x() {
            let node = e(1).node;
            if(!node.evaluateQueue) node.prepEvaluate();
            node.evaluate(1);
        }
        function clr() {
            delete e(1).node.evaluateQueue;
        }


        function Map(relation, predicate) {

            this.id = Map.nextId++;

            this.setRelation(relation);
            this.setPredicate(predicate);

            this.map = {};
            this.waiting = {};
            this.predicateComplete = false;
        }

        Map.prototype.setRelation = function(relation) {
            this.relation = relation;
            if(!relation) return;
            this.relationSet = this.relation.getAll(['<',Concept.in,'*']);
        };

        Map.prototype.setPredicate = function(predicate) {
            this.predicate = predicate;
            if(!predicate) return;
            this.law = predicate.getFirst(['>',Concept.metaOf,'*']);
            this.predicateSet = this.predicate.getAll(['<',Concept.in,'*']);
            this.lawSet = this.law.getAll(['<',Concept.in,'*']);
        };

        Map.map = {};
        Map.nextId = 1;

        Map.prototype.getId = function() {
            return this.id;
        };

        Map.prototype.inRelation = function(part) {
            return this.relationSet.hasOwnProperty(part.getId());
        };
        Map.prototype.inPredicate = function(lawPart) {
            return this.predicateSet.hasOwnProperty(lawPart.getId());
        };
        Map.prototype.inLaw = function(lawPart) {
            return this.lawSet.hasOwnProperty(lawPart.getId());
        };

        Map.prototype.match = function(part, lawPart) {
            let self = this, pid = part.getId(), lid = lawPart.getId();

            // make sure this concept hasn't already been matched to a different predicate
            if(self.map.hasOwnProperty(lid) && self.map[lid] !== part) return false;

            // see if this match has already been added to this map
            if(self.map[lid] === part) return true;

            // mark the pair as matching
            self.map[lid] = part;
            self.map[pid] = lawPart;

            // if this map doesn't have an assigned predicate yet, it must come from the part we are matching
            if(!self.predicate) self.setPredicate(lawPart.getFirst(['>',Concept.in,'predicate']));

            console.log('matched ' + part.toString() + ' to ' + lawPart.toString());
            Page.displayMap(self);

            // prioritize which links of the matched part should be matched next
            let valid = lawPart.eachLink(function(lawLink, lawDirection) {

                // only neighbors that are within the law
                let lawNeighbor = lawLink.getEndpoint(lawDirection);
                let linkInPredicate = false, neighborInPredicate = false, priority = -1;

                if(self.law) {
                    if(!self.inLaw(lawNeighbor)) return true;

                    // if this link is already matched, make sure its connection to the matched part is mirrored in the relation
                    let link = self.getMatch(lawLink);
                    if(link) return link.isNeighbor(part, lawDirection);

                    linkInPredicate = self.inPredicate(lawLink);
                    neighborInPredicate = self.inPredicate(lawNeighbor);
                    let linkRequired = self.predicateComplete || linkInPredicate;

                    // first, links between parts that have already been matched
                    if(lawNeighbor.isLink() && self.hasMatch(lawNeighbor.getEndpoint(lawDirection))) {
                        priority = linkRequired ? 0 : 1;
                    // then, links that extend the current match
                    } else {
                        priority = linkInPredicate || neighborInPredicate ? 2 : 3;
                    }
                } else {
                    linkInPredicate = lawLink.has(['>',Concept.in,'predicate']);
                    priority = linkInPredicate ? 0 : -1;
                    if(priority < 0) return true;
                }

                let id = lawLink.getId();
                if(!self.waiting[id]) self.waiting[id] = {};
                self.waiting[id].link = lawLink;
                self.waiting[id].from = lawPart;
                self.waiting[id].direction = lawDirection;
                self.waiting[id].priority = priority;
                return true;
            });

            if(!valid) return false;
            if(lawPart.isLink()) {
                if(!self.match(part.getStart(), lawPart.getStart())) return false;
                if(!self.match(part.getEnd(), lawPart.getEnd())) return false;
            }

            delete self.waiting[lid];

            if(self.predicateSet)
                self.predicateComplete = Misc.each(self.predicateSet, function(part) {
                    return self.hasMatch(part);
                });

            return true;
        };

        Map.prototype.extend = function(steps) {
            if(!isNaN(steps)) {
                if(steps < 1) return;
                steps--;
            }
            let self = this;

            console.log('\nextending:');

            // find the highest priority link waiting to be matched
            let best = null;
            $.each(self.waiting, function(i, entry) {
                if(!best || (entry.priority >= 0 && entry.priority < best.priority)) best = entry;
                //console.log((entry.link ? entry.link.toString() : 'NONE') + ', priority ' + entry.priority);
            });

            // if nothing left to match, register this map
            if(!best) {
                Page.displayMap(self.fromMap);
                if(self.predicateComplete) self.register();
                return;
            }

            console.log('\nchose ' + best.link.toString());

            // try to find a match for the link
            let lawPart = best.from, lawLink = best.link, lawDirection = best.direction,
                part = self.getMatch(lawPart);

            console.log('checking links of ' + part.toString());

            // try all neighbors in the relation that match the link in the law
            part.eachLink(lawDirection, function(link, dir, neighbor) {
                //if(!self.inRelation(neighbor)) return;
                if(link.getConcept() === lawLink.getConcept()) {
                    console.log('matches ' + link.toString());
                    let newMap = self.clone();
                    if(newMap.match(link, lawLink)) newMap.extend(steps);
                }
            });

            // we can try to extend this map without having matched that link, as long as it wasn't required
            if(best.priority > 0) {
                delete self.waiting[lawLink.getId()];
                self.extend(steps);
            }
        };

        Map.prototype.hasMatch = function(part) {
            return this.map.hasOwnProperty(part.getId());
        };

        Map.prototype.getMatch = function(part) {
            return this.map[part.getId()];
        };

        Map.prototype.register = function() {
            Map.map[Map.nextId++] = this;
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

        Map.prototype.clone = function() {
            let map = new Map();
            map.fromMap = this;
            map.relation = this.relation;
            map.relationSet = this.relationSet;
            map.predicate = this.predicate;
            map.predicateSet = this.predicateSet;
            map.lawSet = this.lawSet;
            Object.assign(map.map, this.map);
            Object.assign(map.waiting, this.waiting);
            map.predicateComplete = this.predicateComplete;
            return map;
        };

        Map.prototype.append = function() {
        };

        Map.prototype.setTentative = function(tentative) {
        };


        Page.displayMap = function(map) {
            Page.displayedMap = map;
            Page.eachExplorer(function(e) {
                let d = e.getActiveDiagram();
                e.eachGoPart(function(goPart) {
                    let part = Part.get(goPart);
                    if(!part) return;
                    let match = map ? map.getMatch(part) : null;
                    part.setGoData(d, 'mapped', match ? match.getId() : null);
                });
                d.requestUpdate();
            });
        };



