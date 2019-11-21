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
            if(self.evaluated) return;

            // identify the top context nodes of this relation
            let R = self.getInLinks('in').get('start');
            let top = R.getTopNodes();

            // for each such top node C
            top.each(function(node) {

                // take every law predicate C is 'in'
                node.eachOutLink('in', 'predicate', function(link, predicate) {

                    // take the set P of nodes and links 'in' that predicate
                    let P = predicate.getInLinks('in').get('start');

                    // look for all matches to P within R
                    let map = new Map(predicate);
                    map.map(node, node);
                    map.extend();
                });
            });
        };


        function Map(predicate) {
            this.predicate = predicate;
            this.map = {};
            this.queue = [];
        }
        Map.nextId = 1;

        Map.prototype.getId = function() {
            return this.id;
        };

        Map.prototype.map = function(part, predicatePart) {
            let self = this, id = part.getId(), pid = predicatePart.getId();

            // make sure this concept hasn't already been matched to a different predicate
            if(self.map.hasOwnProperty(id) && self.map[id] !== predicatePart) return false;
            if(self.map.hasOwnProperty(pid) && self.map[pid] !== part) return false;

            // see if this match has already been added to this map
            if(self.map[id] === predicatePart && self.map[pid] === part) return true;

            // mark the pair as matching
            self.map[id] = predicatePart;
            self.queue.push(predicatePart);
            return true;
        };

        Map.prototype.extend = function() {
            let self = this;
            if(self.queue.length === 0) return true;

            // get the first node/link waiting to be extended - call it X, and its match in the predicate Xp
            let predicatePart = self.queue.pop(), part = self.getMatch(predicatePart);

            // for each of Xp's neighbors Np in the predicate graph
            predicatePart.eachNeighbor(function(predicateNeighbor, predicateDirection) {

                // if Np has already been matched to some part N, then
                // N should connect to X in the same way that Np connects to Xp
                let neighbor = self.getMatch(predicateNeighbor);
                if(neighbor) return neighbor.isNeighbor(part, predicateDirection);

                // otherwise, try all ways of adding a relation part N that matches Np
                part.eachNeighbor(function(neighbor, direction) {
                    let match = direction === predicateDirection &&
                        (neighbor instanceof Node || neighbor.getConcept() === predicateNeighbor.getConcept());
                    if(match) {
                        let newMap = self.clone();
                        newMap.map(neighbor, predicateNeighbor);
                        newMap.extend();
                    }
                });
            });
        };

        Map.prototype.getMatch = function(part) {
            return this.map[part.getId()];
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



