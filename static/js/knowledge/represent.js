Relation.prototype.symbolize = function() {
    let self = this;

    self.law.resolveData('symbol');

    $('#symbolization-wrapper').empty();

    self.law.deepNodes.forEach(function(id) {
        let node = self.findEntry('node', id);
        if(!node) return;
        let symbol = node.getData().getValue('symbol');
        if(!symbol) return;
        let element = '<p><math scriptlevel="-3">' + symbol + '</math></p>';
        $('#symbolization-wrapper').append(element);
    });
};

Relation.prototype.visualize = function() {
    let self = this, canvas = self.canvas;

    self.law.resolveData('visual');

    let canvasEl = canvas.canvas;
    canvasEl.height = Math.max(canvasEl.height, 600);
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

    self.law.deepNodes.forEach(function(id) {
        let node = self.findEntry('node', id);
        node.visualize();
    });
}

Node.prototype.visualize = function() {
    let self = this;
    if(self.visualized) return self.visualContext;
    let head = self.getHead(), ref = self.getReference(),
        headContext = {}, refContext = {};
    if(head) headContext = head.visualize();
    if(ref) refContext = ref.visualize();

    let visual = self.collectData('visual');
    let globalOpts = ['origin', 'rotation', 'scale'];
    /*globalOpts.forEach(function(opt) {
        if(visual.hasOwnProperty(opt)) {
            self.visualContext[opt] = visual[opt];
        } else if(headContext.hasOwnProperty(opt)) {
            self.visualContext[opt] = headContext[opt];
        }
    });//*/

    if(visual.shape) {
        let canvas = self.relation.canvas;
        let shapeOpts = globalOpts.concat(['start', 'end', 'delta', 'direction', 'length']);
        for(let shapeName in visual.shape) {
            Misc.eachChild(visual.shape, shapeName, function(shape) {
                let opts = {}, chain = [shape, visual, self.visualContext];
                shapeOpts.forEach(function(opt) {
                    chain.every(function(ctx) {
                        if(ctx.hasOwnProperty(opt)) {
                            opts[opt] = ctx[opt];
                            return false;
                        }
                        return true;
                    });
                });
                let origin = opts.origin, rotation = opts.rotation || 0, scale = opts.scale || 1,
                    start = opts.start, end = opts.end, delta = opts.delta,
                    direction = opts.direction, length = opts.length;

                rotation = parseFloat(rotation);
                scale = parseFloat(scale);
                canvas.save();

                if(origin) canvas.translate(origin.x, origin.y);
                if(rotation) canvas.rotate(rotation);
                canvas.lineWidth = 2 / scale;
                if(scale) canvas.scale(scale, scale);

                switch(shapeName) {
                    case 'line':
                        let x1 = 0, y1 = 0, x2 = null, y2 = null;
                        if(start) {
                            x1 = start.x;
                            y1 = start.y;
                        }
                        if(end) {
                            x2 = end.x;
                            y2 = end.y;
                        }
                        else if(delta) {
                            x2 = x1 + delta.x;
                            y2 = y1 + delta.y;
                        }
                        else if(length && direction !== undefined) {
                            x2 = x1 + length * Math.cos(direction);
                            y2 = y1 + length * Math.sin(direction);
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
                        if(shape.radius) {
                            if(shape.angleStart) angleStart = shape.angleStart;
                            if(shape.angleEnd) angleEnd = shape.angleEnd;
                            canvas.beginPath();
                            canvas.arc(0, 0, shape.radius, angleStart, angleEnd);
                            canvas.stroke();
                        }
                        break;
                    case 'triangle':
                        break;
                    case 'rightTriangle':
                        if(length !== undefined && direction != undefined) {
                            canvas.beginPath();
                            canvas.lineTo(length * Math.cos(direction), 0);
                            canvas.lineTo(length * Math.cos(direction), length * Math.sin(direction));
                            canvas.lineTo(0, 0);
                            canvas.stroke();
                        }
                        break;
                    case 'rectangle':
                        break;
                    default: break;
                }
                canvas.restore();
            });
        }
    }
    self.visualized = true;
    return self.visualContext;
};

