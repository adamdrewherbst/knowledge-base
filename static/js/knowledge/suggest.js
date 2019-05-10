
/*
Based on the current relation, list all possible next steps in symbolic form.

This means we find all laws who have a predicate matching the relation.
We append those laws to the relation, but all appended nodes are marked as tentative,
meaning the law has not really been applied yet.  When searching for predicates, we
ignore tentative nodes, so we're only matching knowledge that has already been applied.

The relation is then re-symbolized, so that each law found here can be written symbolically
in the context of the relation.  A button is placed next to each law to let the user select
the one they want to apply.

Once they select a law, that law's appended nodes are no longer tentative.  But all other
tentative nodes remain, and the predicates they matched do not have to be re-checked for the
next suggestion.  Only the new nodes, ie. the ones from the law chosen here, have to be checked.
*/

Relation.prototype.suggest = function() {
    let self = this;

    // find all laws that could be appended to the current relation, and append them 'tentatively',
    // which leaves the appended nodes invisible.  Once the user accepts the suggested law, those nodes
    // will appear.
    self.evaluate({ tentative: true });

    // execute all symbol-related node data commands so that each node has its symbol, including the
    // new invisible tentative nodes
    self.law.resolveData('symbol');

    // suggestions will be listed in this div, below the diagram (created in knowledge.html)
    $('#suggestion-wrapper').empty();

    // During evaluation, a map is created for each partial match from the relation to a predicate of a law.
    // We find all maps that are complete matches, meaning the law predicate is fully satisfied, and list
    // them in symbolic form so the user knows what laws could be applied.

    for(let mapId in self.law.maps) {

        let map = self.law.maps[mapId];

        // only suggest laws that are fully satisfied by the relation and are still tentative (have not already been applied)
        if(!map.tentative || !map.satisfied) continue;

        // similar to how we symbolize the relation itself (see symbolize in represent.js), we only display the symbol for each
        // deep node that would be added by applying the law, as the symbol for a node represents its entire ancestor tree

        let law = map.predicateLaw, symbols = [];

        for(let i = 0; i < law.deepNodes.length; i++) {
            let n = law.deepNodes[i], lawNode = self.findEntry('node', n);
            if(!lawNode || lawNode.isPredicate) continue;
            let node = self.findEntry('node', map.idMap[n]);
            if(!node) continue;
            console.log('adding symbol for node ' + n);

            // when symbol data is resolved, the final symbol of each node is stored in its 'symbol' data key
            // (see NodeData.prototype.fullyResolve in nodeData.js)

            symbols.push('<math scriptlevel="-1">' + node.getData().getValue('symbol') + '</math>');
        }

        // create a horizontal div showing the name of the law to be applied and its symbolic representation within the relation

        let $entry = $('<div class="suggestion" map-id="' + mapId + '"></div>');
        $entry.append('<span class="suggestion-name">' + law.name + '</span>');
        $entry.append('<span class="suggestion-symbol">' + symbols.join(',  ') + '</span>')

        // on the right of the symbol for the suggestion, put a button so the user can accept it

        let $acceptButton = $('<button class="suggestion-accept btn btn-primary" type="button">Accept</button>');
        $acceptButton.click(function(e) {
            self.acceptSuggestion(map);
        });
        $entry.append($acceptButton);

        // display the suggestion
        $('#suggestion-wrapper').append('<hr>').append($entry);
    }
};

// called when the user clicks the 'Accept' button next to a listed suggestion
// we need to add to this function to make it hide that suggestion, or perhaps change the
// 'Accept' button to 'Revert' to let them un-do that suggestion

Relation.prototype.acceptSuggestion = function(map) {
    let self = this;
    map.setTentative(false);
    self.symbolize();
};



