
/*
Based on the current relation, list all possible next steps in symbolic form.

This means we find all laws who have a predicate matching the relation.
We append those laws to the relation, but all appended nodes are marked as tentative,
meaning the law has not really been applied yet.  When searching for predicates, we
ignore any tentative nodes in the relation, so we're only matching knowledge that
has already been applied.

The relation is then re-symbolized, so that each law found here can be written symbolically
in the context of the relation.  A button is placed next to each law to let the user select
the one they want to apply.

Once they select a law, that law's appended nodes are no longer tentative.  But all other
tentative nodes remain, and the predicates they matched do not have to be re-checked for the
next suggestion.  Only the new nodes, ie. the ones from the law chosen here, have to be checked.
*/

Relation.prototype.suggest = function() {
    let self = this;

    self.evaluate({ tentative: true });
    self.symbolize();

    $('#suggestion-wrapper').empty();
    for(let mapId in self.law.maps) {
        let map = self.law.maps[mapId];
        if(!map.tentative || !map.satisfied) continue;

        let law = map.predicateLaw, symbols = [];
        for(let i = 0; i < law.deepNodes.length; i++) {
            let n = law.deepNodes[i], lawNode = self.findEntry('node', n);
            if(!lawNode || lawNode.isPredicate) continue;
            let node = self.findEntry('node', map.idMap[n]);
            if(!node) continue;
            console.log('adding symbol for node ' + n);
            symbols.push('<math scriptlevel="-1">' + node.symbol.toString() + '</math>');
        }

        let $entry = $('<div class="suggestion"></div>');
        $entry.append('<span class="suggestion-name">' + law.name + '</span>');
        $entry.append('<span class="suggestion-symbol">' + symbols.join(',  ') + '</span>')

        let $acceptButton = $('<button class="suggestion-accept btn btn-primary" type="button">Accept</button>');
        $acceptButton.click(function(e) {
            self.acceptSuggestion(map);
        });
        $entry.append($acceptButton);

        $('#suggestion-wrapper').append('<hr>').append($entry);
    }
};

Relation.prototype.acceptSuggestion = function(map) {
    let self = this;
    map.setTentative(false);
    self.symbolize();
};



