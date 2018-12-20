        Relation.prototype.visualize = function() {
            let self = this, canvas = self.canvas;

            //self.syncGraph();
            self.evaluate({
                tag: 'visualization',
                propagate: {value: true}
            });

            canvas.strokeColor = 'red';
            canvas.lineWidth = 4;
            canvas.fillColor = 'blue';

            //all the visualization objects will have been determined in the relation
            let objects = self.law.getNodesByConcept('visual');
            objects.forEach(function(object) {
                let originNode = object.getChildrenByConcept('origin')[0], origin = null;
                if(originNode) {
                    let opt = self.getChildTree(originNode);
                    if(opt.x && opt.y) origin = {x: opt.x._value, y: opt.y._value};
                }
                let head = object.getHead();
                console.log('visualizing ' + head.getConcept().name + ' [' + head.id + ']');
                if(origin) console.log('from (' + origin.x + ', ' + origin.y + ')');
                let shapes = object.getChildrenByConcept('shape');
                shapes.forEach(function(shape) {
                    let shapeName = shape.getConcept().name, opt = self.getChildTree(shape);
                    console.log('drawing shape ' + shapeName);
                    console.info(opt);
                    switch(shapeName) {
                        case 'line':
                            let x1 = null, y1 = null, x2 = null, y2 = null;
                            if(origin) {
                                x1 = origin.x;
                                y1 = origin.y;
                            }
                            if(opt.start && opt.start.x && opt.start.y) {
                                x1 += opt.start.x._value;
                                y1 += opt.start.y._value;
                            }
                            if(opt.end && opt.end.x && opt.end.y) {
                                x2 = opt.end.x._value;
                                y2 = opt.end.y._value;
                            }
                            else if(opt.delta && opt.delta.x && opt.delta.y) {
                                x2 = x1 + opt.delta.x._value;
                                y2 = y1 + opt.delta.y._value;
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
                            break;
                        case 'circle':
                            if(origin && opt.radius) {
                                canvas.beginPath();
                                canvas.arc(origin.x, origin.y, opt.radius._value, 0, 2*Math.PI);
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
            });
        };


        Relation.prototype.getChildTree = function(node) {
            let self = this, val = node.value.toString();
            if(!isNaN(val)) val = parseFloat(val);
            let opts = {_value: val};
            let children = node.getChildren();
            children.forEach(function(child) {
                let concept = child.getConcept();
                opts[concept.name] = self.getChildTree(child);
            });
            return opts;
        };
