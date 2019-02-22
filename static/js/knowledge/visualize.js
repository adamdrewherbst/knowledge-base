Relation.prototype.visualize = function() {
    let self = this, law = self.law, canvas = self.canvas;
    if(!law) return;

    law.initData('visual');

    law.eachNode(function(node) {
        let visual = node.collectData('visual');
        if(visual.shape) {
            for(let shape in visual.shape) {
                Misc.eachKey(visual.shape, shape, function(shape) {
                    switch(shape) {
                        case 'line':
                            let x1 = null, y1 = null, x2 = null, y2 = null;
                            if(shape.origin) {
                                x1 = shape.origin.x._value;
                                y1 = shape.origin.y._value;
                            }
                            if(shape.start) {
                                x1 += shape.start.x._value;
                                y1 += shape.start.y._value;
                            }
                            if(shape.end) {
                                x2 = shape.end.x._value;
                                y2 = shape.end.y._value;
                            }
                            else if(shape.delta) {
                                x2 = x1 + shape.delta.x._value;
                                y2 = y1 + shape.delta.y._value;
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
                            if(shape.origin && shape.radius) {
                                if(shape.angleStart) angleStart = shape.angleStart._value;
                                if(shape.angleEnd) angleEnd = shape.angleEnd._value;
                                canvas.beginPath();
                                canvas.arc(shape.origin.x._value, shape.origin.y._value, shape.radius._value, angleStart, angleEnd);
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

