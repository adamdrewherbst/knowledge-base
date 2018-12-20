        Relation.prototype.symbolize = function() {
            let self = this;
            self.law.propagateData('symbol');
            $('#symbolization-wrapper').empty();
            self.law.deepNodes.forEach(function(id) {
                let node = self.nodes[id];
                if(node.symbol.known) {
                    let symbol = '<p><math scriptlevel="-3">' + node.symbol.toString() + '</math></p>';
                    $('#symbolization-wrapper').append(symbol);
                }
            });
        };


