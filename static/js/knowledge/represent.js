Relation.prototype.symbolize = function() {
    let self = this
    $('#symbolization-wrapper').empty();
    self.law.deepNodes.forEach(function(id) {
        let node = self.findEntry('node', id);
        if(!node) return;
        let symbol = node.getData().getValue('symbol');
        if(!symbol) return;
        let element = '<p><math scriptlevel="-3">' + text + '</math></p>';
        $('#symbolization-wrapper').append(element);
    });
};

Relation.prototype.visualize = function() {
    let self = this, law = self.law, canvas = self.canvas;
    if(!law) return;

    let canvasEl = canvas.canvas;
    canvasEl.height = 600;
    let width  = canvasEl.width, height = canvasEl.height;
    canvas.setTransform(1, 0, 0, -1, width/2, height/2);
    canvas.clearRect(-width/2, -height/2, width/2, height/2);
    canvas.setLineDash([10, 10]);
    canvas.moveTo(-width/2, 0);
    canvas.lineTo(width/2, 0);
    canvas.moveTo(0, -height/2);
    canvas.lineTo(0, height/2);
    canvas.stroke();
    canvas.setLineDash([]);

    law.eachNode(function(node) {
        let visual = node.collectData('visual');
        if(visual.shape) {
            for(let shapeName in visual.shape) {
                Misc.eachChild(visual.shape, shapeName, function(shape) {
                    let origin = shape.origin || visual.origin,
                        start = shape.start || visual.start,
                        end = shape.end || visual.end,
                        delta = shape.delta || visual.delta;
                    switch(shapeName) {
                        case 'line':
                            let x1 = null, y1 = null, x2 = null, y2 = null;
                            if(origin) {
                                x1 = origin.x;
                                y1 = origin.y;
                            }
                            if(start && end) {
                                x1 += start.x;
                                y1 += start.y;
                                x2 = end.x;
                                y2 = end.y;
                            }
                            else if(delta) {
                                x2 = x1 + delta.x;
                                y2 = y1 + delta.y;
                            }
                            if(typeof x1 == 'number' && typeof x2 == 'number' && typeof y1 == 'number' && typeof y2 == 'number') {
                                console.log('line from (' + x1 + ',' + y1 + ') to (' + x2 + ',' + y2 + ')');
                                canvas.beginPath();
                                canvas.moveTo(x1, y1);
                                canvas.lineTo(x2, y2);
                                canvas.stroke();
                            }
                            break;
                        case 'arrow':
                            break;
                        case 'arc':
                        case 'circle':
                            let angleStart = 0, angleEnd = 2*Math.PI;
                            if(origin && shape.radius) {
                                if(shape.angleStart) angleStart = shape.angleStart;
                                if(shape.angleEnd) angleEnd = shape.angleEnd;
                                canvas.beginPath();
                                canvas.arc(origin.x, origin.y, shape.radius, angleStart, angleEnd);
                                canvas.stroke();
                            }
                            break;
                        case 'triangle':
                            break;
                        case 'rectangle':
                            break;
                        default: break;
                    }
                });
            }
        }
    });
};

