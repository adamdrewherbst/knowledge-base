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

                part.eachIncoming(['is a'], function(link) {
                    queue.push(link);
                });
            });
        };


        function Map(relation, predicate) {

            this.relation = relation;
            this.predicate = predicate;
            this.law = predicate.getOutgoing(['of', 'law'])[0];

            this.relationSet = this.relation.getChildren();
            this.predicateSet = this.predicate.getChildren();
            this.lawSet = this.law.getChildren();

            this.map = {};
            this.waiting = {};
            this.predicateComplete = false;
        }

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

        Map.prototype.map = function(part, lawPart) {
            let self = this, lid = lawPart.getId();

            // make sure this concept hasn't already been matched to a different predicate
            if(self.map.hasOwnProperty(lid) && self.map[lid] !== part) return false;

            // see if this match has already been added to this map
            if(self.map[lid] === part) return true;

            // mark the pair as matching
            self.map[lid] = part;

            // prioritize which links of the matched part should be matched next
            let valid = lawPart.eachLink(function(lawLink, lawDirection) {

                // only neighbors that are within the law
                let lawNeighbor = lawLink.getEndpoint(lawDirection);
                if(!self.inLaw(lawNeighbor)) return;

                // if this link is already matched, make sure its connection to the matched part is mirrored in the relation
                let link = self.getMatch(lawLink);
                if(link) return link.isNeighbor(part, lawDirection);

                let linkInPredicate = predicateSet.hasOwnProperty(lawLink.getId()),
                    neighborInPredicate = predicateSet.hasOwnProperty(lawNeighbor.getId()),
                    linkRequired = self.predicateComplete || linkInPredicate,
                    priority = -1;

                // first, links between parts that have already been matched
                if(lawNeighbor.isLink() && self.hasMatch(lawNeighbor.getEndpoint(lawDirection))) {
                    priority = linkRequired ? 0 : 1;
                // then, links that extend the current match
                } else {
                    priority = linkInPredicate || neighborInPredicate ? 2 : 3;
                }

                let id = lawLink.getId();
                if(!self.waiting[id]) self.waiting[id] = {};
                self.waiting[id].part = lawNeighbor;
                self.waiting[id].from = lawPart;
                self.waiting[id].direction = lawDirection;
                self.waiting[id].priority = priority;
            });

            if(!valid) return false;
            if(lawPart.isLink()) {
                if(!self.map(part.getStart(), lawPart.getStart())) return false;
                if(!self.map(part.getEnd(), lawPart.getEnd())) return false;
            }

            delete self.waiting[lawPart.getId()];

            self.predicateComplete = Misc.each(self.predicateSet, function(part) {
                return self.hasMatch(part);
            });

            return true;
        };

        Map.prototype.extend = function() {
            let self = this;

            // find the highest priority link waiting to be matched
            let best = null;
            $.each(self.waiting, function(entry) {
                if(!best || (entry.priority >= 0 && entry.priority < best.priority)) best = entry;
            });

            // if nothing left to match, register this map
            if(!best && self.predicateComplete) {
                self.register();
                return;
            }

            // try to find a match for the link
            let lawPart = best.from, lawLink = best.part, lawDirection = best.direction,
                part = self.getMatch(lawPart);

            // try all neighbors in the relation that match the link in the law
            part.eachLink(lawDirection, function(link) {
                if(!self.inRelation(link.getEndpoint(lawDirection))) return;
                if(link.getConcept() === lawLink.getConcept()) {
                    let newMap = self.clone();
                    if(newMap.map(link, lawLink)) newMap.extend();
                    found = true;
                }
            });

            // we can try to extend this map without having matched that link, as long as it wasn't required
            if(best.priority > 0) {
                delete self.waiting[lawLink.getId()];
                self.extend();
            }
        };

        Map.prototype.hasMatch = function(lawPart) {
            return this.map.hasOwnProperty(lawPart.getId());
        };

        Map.prototype.getMatch = function(lawPart) {
            return this.map[lawPart.getId()];
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
            let map = Object.assign({}, this);
        };

        Map.prototype.append = function() {
        };

        Map.prototype.setTentative = function(tentative) {
        };



