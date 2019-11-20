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

            // take the set of nodes R that are 'in' this concept
            let R = self.getSubgraph();

            // for each node and link of the subgraph
            R.eachTopNode(function(part) {
                let node = null;
                if(part instanceof Node) node = part;
                else if(part instanceof Link) node = R.getNode(part.getConcept());

                // take every law predicate C is 'in'
                node.eachOutLink('in', 'predicate', function(link, predicate) {
                    // take the set P of nodes 'in' that predicate
                    let P = predicate.getSubgraph();

                    // look for all matches to P within R
                    let map = new Map();
                    map.map(node, node);
                    map.extend(node);
                });
            });
        };

        Node.prototype.getSubgraph = function() {
            let self = this, graph = new Graph();
            self.eachInLink('in', function(link, node) {
                let newNode = graph.addNode({
                    concept: node.getConcept(),
                    from: node
                });
                node.eachLink(function(link, neighbor) {
                    let newNeighbor = graph.from(neighbor);
                    if(newNeighbor) {
                        newNode.addLink(link.getDirection(), link.getConcept(), newNeighbor);
                    }
                });
            });
        };


        function Map() {
            this.map = {};
        }
        Map.nextId = 1;

        Map.prototype.getId = function() {
            return this.id;
        };

        Map.prototype.map = function(node, predicateNode) {
            let self = this, nid = node.getId(), pid = predicateNode.getId();

            // make sure this concept hasn't already been matched to a different predicate
            if(self.idMap.hasOwnProperty(nid) && self.idMap[nid] !== pid) return false;

            // see if this match has already been added to this map
            if(self.idMap[nid] === pid && self.idMap[pid] === nid) return true;

            // mark the pair as matching
            self.map[nid] = pid;
            return true;
        };

        Map.prototype.getMatch = function(node) {
            return this.map[node.getId()];
        };

        Map.prototype.extend = function(predicateNode) {
            let self = this, node = self.getMatch(predicateNode);

            // for each neighbor in the predicate graph
            predicateNode.eachLink(function(pLink, pNeighbor) {
                if(self.getMatch(pNeighbor)) return true;

                // try all ways of adding a relation node that matches that neighbor
                node.eachLink(function(link, neighbor) {
                    if(link.getConcept() === pLink.getConcept()) {
                        let newMap = self.clone();
                        newMap.map(neighbor, pNeighbor);
                        newMap.extend(pNeighbor);
                    }
                });
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



