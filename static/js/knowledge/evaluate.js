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
            self.resetEvaluate();

            self.each(['<', Concept.in, '*'], function(member) {
                member.eachLink(function(link, dir, neighbor) {
                    if(neighbor !== self && !neighbor.has(['>',Concept.in,self])) {
                        self.evaluateQueue.push(neighbor);
                    }
                });
            });
        };


        Part.prototype.evaluate = function(steps) {
            let self = this, fully = isNaN(steps);
            Page.evalSteps = steps;

            if(!self.evaluateQueue || self.evaluateQueue.length < 1) self.prepEvaluate();

            while(fully || Page.evalSteps > 0) {
                if(!Page.displayedMap) {
                    let part = self.evaluateQueue.pop();
                    if(!part) return;
                    console.log('NOW DOING PART ' + part.toString());
                    let map = new Map(self);
                    map.match(part, part);
                    if(!fully) Page.evalSteps--;
                }
                Page.displayedMap.extend();
            }

            // upon completion, get rid of obselete references
            if(fully) {
                for(let id in Map.map) delete Map.map[id].fromMap;
            }
        };


        Part.prototype.resetEvaluate = function() {
            Page.displayMap(null);
            let ids = Object.keys(Map.map);
            ids.forEach(id => Map.map[id].unregister());
            Map.nextId = 1;
            Map.checkedLaw = {};
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
            this.maximal = true;
        }

        Map.prototype.setRelation = function(relation) {
            this.relation = relation;
            if(!relation) return;
            this.relationSet = this.relation.getAll(['<',Concept.in,'*']);
        };

        Map.prototype.setPredicate = function(predicate) {
            let self = this;
            self.predicate = predicate;
            if(!predicate) return;
            self.law = predicate.getFirst(['>',Concept.of,'*']);
            self.predicateSet = self.predicate.getAll(['<',Concept.in,'*']);
            Misc.each(self.predicateSet, function(part) {
                if(part.start) self.predicateSet[part.start.getId()] = part.start;
                if(part.end) self.predicateSet[part.end.getId()] = part.end;
            });
            self.lawSet = self.law.getAll(['<',Concept.in,'*']);
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
            if(!self.predicate) {
                let predicate = lawPart.getFirst(['>',Concept.in,'predicate']);
                if(predicate) {
                    self.setPredicate(predicate);
                    Map.checkedLaw[self.law.getId()] = true;
                    console.log('  set law to ' + self.law.toString());
                }
            }

            console.log('  matched ' + part.toString() + ' to ' + lawPart.toString());
            Page.displayMap(self);

            // prioritize which links of the matched part should be matched next
            let valid = lawPart.eachLink(function(lawLink, lawDirection) {

                //console.log('    checking link ' + lawLink.toString());

                let lawNeighbor = lawLink.getEndpoint(lawDirection), priority = -1;

                if(self.law) {
                    // don't match meta-links or links between parts outside the law
                    if(lawNeighbor === self.law || lawNeighbor.isMeta()) return true;
                    if(!self.inLaw(lawPart) && !self.inLaw(lawNeighbor)) return true;

                    // if this link is already matched, make sure its connection to the matched part is mirrored in the relation
                    let link = self.getMatch(lawLink);
                    if(link) return link.isNeighbor(part, Part.getOppositeDirection(lawDirection));

                    let linkInPredicate = self.inPredicate(lawLink),
                        neighborInPredicate = self.inPredicate(lawNeighbor),
                        endMatched = self.hasMatch(lawLink.getEndpoint(lawDirection)),
                        linkExternal = !self.inLaw(lawNeighbor);

                    // first, required links within the current match or to external nodes
                    if((self.predicateComplete || linkInPredicate) && (endMatched || linkExternal)) {
                        priority = 0;
                    // then, required links that extend the current match
                    } else if(linkInPredicate) {
                        priority = 1;
                    // then, links between predicate nodes (not required)
                    } else if(neighborInPredicate) {
                        priority = 2;
                    // then, any other link
                    } else {
                        priority = 3;
                    }
                } else {
                    // the first step is to find a link that is in a predicate
                    let predicate = lawLink.getFirst(['>',Concept.in,'predicate']);
                    if(!predicate) return true;
                    let law = predicate.getFirst(['>',Concept.of,'*']);
                    if(Map.checkedLaw[law.getId()]) return true;
                    priority = 0;
                }

                // mark this map as waiting to match the identified link
                let id = lawLink.getId();
                if(!self.waiting[id]) self.waiting[id] = {};
                self.waiting[id].link = lawLink;
                self.waiting[id].from = lawPart;
                self.waiting[id].to = lawNeighbor;
                self.waiting[id].direction = lawDirection;
                self.waiting[id].priority = priority;
                console.log('    waiting on ' + lawLink.toString() + ' with priority ' + priority);
                return true;
            });

            if(!valid) return false;
            if(lawPart.isLink()) {
                if(!self.match(part.getStart(), lawPart.getStart())) return false;
                if(!self.match(part.getEnd(), lawPart.getEnd())) return false;
            }

            if(self.predicateSet)
                self.predicateComplete = Misc.each(self.predicateSet, function(part) {
                    return self.hasMatch(part);
                });

            return true;
        };

        Map.prototype.extend = function() {
            if(!isNaN(Page.evalSteps)) {
                if(Page.evalSteps < 1) return;
                Page.evalSteps--;
            }
            let self = this;

            console.log('\nextending:');

            // find the highest priority link waiting to be matched
            let bestInd = -1, best = null;
            $.each(self.waiting, function(i, entry) {
                if(!best || (entry.priority >= 0 && entry.priority < best.priority)) {
                    best = entry;
                    bestInd = i;
                }
            });

            // if nothing left to match, register this map
            if(!best) {
                if(self.predicateComplete && self.maximal) self.register();
                Page.displayMap(self.fromMap);
                console.log('RETURNING TO MAP ' + (self.fromMap ? self.fromMap.id : '<none>'));
                return;
            }

            // try to find a match for the link
            let lawLink = best.link, lawPart = best.from, lawNeighbor = best.to, lawDirection = best.direction,
                priority = best.priority,
                part = self.getMatch(lawPart);

            delete self.waiting[bestInd];

            console.log('trying to match ' + lawLink.toString());

            // try all neighbors in the relation that match the link in the law
            part.eachLink(lawDirection, function(link, dir, neighbor) {

                // don't allow a link to be matched to itself
                if(link === lawLink) return;

                // if the link is to a part not 'in' the law, the matched link must be to the same exact part
                if(self.law && !self.inLaw(lawNeighbor) && neighbor !== lawNeighbor) return;

                // otherwise, all that matters is that the concepts of the two links match
                if(link.getConcept() === lawLink.getConcept()) {
                    let newMap = self.clone();
                    console.log('NEW MAP: ' + newMap.id);
                    console.log('  attempting match to ' + link.toString());
                    if(newMap.match(link, lawLink)) {
                        self.maximal = false;
                        newMap.extend();
                    }
                }
            });

            // we can try to extend this map without having matched that link, as long as it wasn't required
            if(priority > 1) {
                self.extend();
            }
        };

        Map.prototype.hasMatch = function(part) {
            return this.map.hasOwnProperty(part.getId());
        };

        Map.prototype.getMatch = function(part) {
            return this.map[part.getId()];
        };

        Map.prototype.register = function() {
            let self = this;
            Map.map[self.id] = self;
            Page.eachExplorer(function(e) {
                e.addMapOption(self.id);
            });
        };

        Map.prototype.unregister = function() {
            let self = this;
            delete Map.map[self.id];
            Page.eachExplorer(function(e) {
                e.removeMapOption(self.id);
            });
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
            map.law = this.law;
            map.lawSet = this.lawSet;
            Object.assign(map.map, this.map);
            for(let id in this.waiting) {
                map.waiting[id] = {};
                Object.assign(map.waiting[id], this.waiting[id]);
            }
            map.predicateComplete = this.predicateComplete;
            return map;
        };

        Map.prototype.apply = function() {
            let self = this;
            Page.newLinks = {};
            self.law.eachIn(function(lawPart) {
                self.appendPart(lawPart);
            });
            Page.eachExplorer(function(e) {
                Misc.each(Page.newLinks, function(link) {
                    e.checkLink(link);
                });
                e.updateShown();
            });
        };

        Map.prototype.appendPart = function(lawPart) {
            let self = this, start = lawPart.getStart(), end = lawPart.getEnd();
            if(!self.inLaw(lawPart) && (!start || !self.inLaw(start)) && (!end || !self.inLaw(end))) {
                console.log('not appending ' + lawPart.toString());
                return lawPart;
            }
            let part = self.getMatch(lawPart);
            if(part) return part;
            let data = {};
            if(lawPart.isLink()) data.concept = lawPart.getConcept();
            part = Part.create(data);
            part.appended = true;
            self.map[part.getId()] = lawPart;
            self.map[lawPart.getId()] = part;
            lawPart.eachNeighbor(function(lawNeighbor, lawDirection) {
                if(lawNeighbor.isMeta()) return;
                let neighbor = self.appendPart(lawNeighbor);
                part.setNeighbor(neighbor, lawDirection);
                if(lawNeighbor === lawPart.start) part.setStart(neighbor);
                if(lawNeighbor === lawPart.end) part.setEnd(neighbor);
            });
            if(part.isLink()) {
                Page.newLinks[part.getId()] = part;
            } else {
                Part.create({
                    concept: Concept.in,
                    start: part,
                    end: self.relation
                })
            }
            return part;
        };

        Map.prototype.setTentative = function(tentative) {
        };

        Map.prototype.toString = function() {
            let str = '';
            for(let id in this.map) {
                str += '' + id + ': ' + this.map[id].id + ', ';
            }
            if(str.length > 2) str = str.substring(0, str.length-2);
            return str;
        };

        Map.printMaps = function() {
            for(let id in Map.map) {
                console.log('MAP ' + id);
                console.log(Map.map[id].toString());
            }
        };


        Page.displayMap = function(map) {
            Page.displayedMap = map;
            Page.eachExplorer(function(e) {
                let d = e.getActiveDiagram();
                e.eachGoPart(function(goPart) {
                    let part = Part.get(goPart);
                    if(!part) return;
                    let match = map ? map.getMatch(part) : null;
                    part.setGoData(d, 'mappedId', match ? match.getId() : null);
                });
                d.requestUpdate();
            });
        };



