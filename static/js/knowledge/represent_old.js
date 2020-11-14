/*
    These functions are used to determine the symbolic or visual representation for each node in the diagram.
    We do this be executing the data commands on each node using the functionality in nodeData.js, then
    parsing the resulting data tree of each node into its symbol and visual.
*/



/*
    Wrapper class to store a single node's visual representation.  This corresponds to the 'visual' subtree
    of that node's data tree (see nodeData.js).

    When we draw something, we start with a blank slate.  Then we assert that we are going to draw a particular
    shape, but that comes with certain degrees of freedom.  A circle has a center and radius; a triangle
    has side lengths and angles; a line has a start and end point.

    Often a given shape has alternative equivalent parameter sets.  For example, a line could specify a delta
    rather than an end point.  A triangle could specify angle-side-angle, or side-angle-side.  A circle could
    specify diameter instead of radius.

    The thing is that a shape's parameters will not usually be fully specified by the node alone.  For example,
    a 'vector' node specifies that its visual is an arrow, but it doesn't specify the start or end point until
    the vector has a 'magnitude' and 'direction' property, or alternatively 'components'.

    So in order to let users build their problem by dragging and dropping concepts visually, we need to have a
    default parameter set for each shape.  Then, when the user adds a child node, it may specify one or more
    of those parameters.  Depending on which parameters get specified by child nodes, we know which parameter
    set we are using (eg. start-end vs. start-length-direction).

    In general, a child node is a relation to another node.  So the user has to select the two parent nodes and
    then choose from the list of possible relations between them.

    Imagine a ball on the end of a stick.  We can say the line from the end of the stick to the center of the ball
    is parallel to the stick, and its length is the radius of the ball.  But what if the stick was specified by
    a delta, not an endpoint?  So what we need are hard-coded relations between the visual parameters, so that once we have
    a complete set we can refer to the value of a parameter that was not specified.

    circle.center = line.end + line.unit * circle.radius

    This is the general scheme for any representation (visual, symbol).  We need a complete set of parameters to specify
    it, some of which may be determined by child nodes, and then we can refer to any known parameter.

    Here we need a hierarchy of representational concepts, just like physical/mathematical concepts.  Under Visual
    we have Shape; under Shape, Line/Circle/Triangle/etc.  But each has its hard-coded functionality.  We also have
    Parameter.  We can switch

    Point:
        x = 0
        y = 0
        magnitude = Math.sqrt(x*x + y*y)
        magnitude = x / Math.cos(angle)
        magnitude = y / Math.sin(angle)
        angle = Math.atan2(y, x)
        x = magnitude * Math.cos(angle)
        y = magnitude * Math.sin(angle)
        x = Math.sqrt(magnitude*magnitude - y*y)
        y = Math.sqrt(magnitude*magnitude - x*x)

    Line:
        Point start, end
        Point delta = end - start
        delta.x = length * Math.cos(angle)
        delta.y = length * Math.sin(angle)
        length = delta.magnitude
        direction = delta.direction
        Point unit = delta / length
        unit.x = Math.cos(angle)
        unit.y = Math.sin(angle)
        start = end - unit * length
        end = start + unit * length

    Polygon:
        n = 3
        Point p[n]
        Line l[n]
        angle[n]
        l[i].start = p[i]
        l[i].end = p[i+1]
        angle[i] = l[i+1].direction - l[i].direction

    Triangle: Polygon
        n = 3
        hide n

    Arc:
        Point center
        radius = 1
        diameter = 2 * radius
        start = 0
        end = 2 * Math.PI

    Circle: Arc
        start = 0
        end = 2 * Math.PI
        hide start, end

    We declare the visual elements, their relations, and the relations between their parameters as above.  When the site
    is loaded, we parse these definitions and register the class names along with their parameters.

    We also have a class, defined below, for each element defined above.  The class has a function to draw the element,
    using some preferred parameter set, and a function to respond to user mouse input.  The class is registered to its name,
    so when a user declares eg. a line within a concept representation, we know to instantiate the Line class.

    Then the user can
    specify concept-level commands such as:

    visual:
        line.delta.x = 50
        line.angle = 45
        circle C
        C.radius = 210
        C.center.x = 0
        C.center.y = -344

    These will be parsed and the respective objects (Line, Circle) will be instantiated.  Then, we have a master function
    that that

    Each key in the node's data tree is an element of its representation, so it may have a parameter specification as above.
    So it has to store its type along with its name.  If it has a type, it can be passed to the rendering function, which
    will parse its subtree and see if it can evaluate the parameters needed for rendering.

    By default we assume the name and type are the same.

    During evaluation, type-level commands are treated as more commands to be evaluated.

    Which means that a data command can actually be in the context of a node data key, not just a node.
    For example, if there is a visual.line data key of type Line, we compile the command 'end = start + unit * length'
    on it.  This command will depend on start, unit, and length, so once these are known, it will resolve end.
    This command is linked to the visual.line data key.

    So each command basically just has to prepend its root data key to every reference in it.

    We could have a database entry for each key type.  It would contain the type name, description, and commands.
    Like a minimal concept record.

    Or we could make them actual concept records.  These could live in the 'Representation' framework.  After all,
    node data commands and key type commands are just shorthand versions of laws.  Then we are extending the language
    of data commands.

    That means we are promoting a data key to a node, but we still want to store it more compactly if possible.
    It needs to know what concept it is an instance of, but it is not a Node object, so the containing node will
    compile all its commands for it.

    So when normal data commands create subkeys, we need to know what type that subkey is
*/

NodeData.prototype.render = function(type) {

};

Relation.prototype.getElementParameter = function(element) {

};

Relation.prototype.drawElement = function(element) {
    let self = this, canvas = this.canvas;
    switch(element.type) {
        case 'point':
            let x = self.getElementParameter(element, 'x'), y = self.getElementParameter('y');
            canvas.arc(x, y, 2, 0, 2*Math.PI);
            break;
        case 'line':
            break;
        case 'polygon':
            break;
        case 'triangle':
            break;
        case 'arc':
            break;
        case 'circle':
            break;
    }
};


Relation.prototype.mouseElement = function(element) {

};




// get the symbolic representation of each node from the diagram, and display those of the deep nodes by default;
// once this function has been run, the user can then click on any node and its symbol will be displayed

Relation.prototype.symbolize = function() {
    let self = this;

    // defined in databaseWrappers.js, and uses functionality from nodeData.js
    self.law.resolveData('symbol');

    // the symbols are displayed in this div, which is below the diagram (see knowledge.html)
    $('#symbolization-wrapper').empty();

    // The symbol of each deep node describes the relation encoded by that node's entire
    // ancestor tree.  So, by displaying the symbols for only the deep nodes, we capture
    // the essence of the entire relation.

    self.law.deepNodes.forEach(function(id) {
        let node = self.findEntry('node', id);
        if(!node) return;
        let symbol = node.getData().getValue('symbol');
        if(!symbol) return;

        // the symbol is in MathML format (see NodeData.prototype.fullyResolve in nodeData.js),
        // so we embed it in a <math> tag; this by itself would display decently in most browsers, but we
        // also run the MathJax plugin (loaded in the header in knowledge.html) to make sure it looks pretty across platforms

        let element = '<p><math scriptlevel="-3">' + symbol + '</math></p>';
        $('#symbolization-wrapper').append(element);
    });
};

// draw the visual representation of the relation, by first executing all visual node data commands
// and then parsing each node's data tree into a visual representation
Relation.prototype.visualize = function() {
    let self = this, canvas = self.canvas;

    // execute all node data commands that modify the 'visual' key of the node data tree
    self.law.resolveData('visual');

    // clear the canvas and draw a horizontal and vertical dashed line for the x and y axes
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

    // parse each node's data tree in order to draw it on the canvas
    self.law.nodes.forEach(function(id) {
        let node = self.findEntry('node', id);
        node.visualize();
    });
}

// parse the 'visual' subtree of this node's data tree in order to actually draw it on the canvas

Node.prototype.visualize = function() {
    let self = this;

    // start by converting the 'visual' subtree into an object which is easy to traverse
    let visual = self.collectData('visual'); // defined in nodeData.js

    // the visualization of a node may be given an origin (x & y coordinates relative to the center of the
    // canvas), a rotation (in radians clockwise from the horizontal), and a scale.  These parameters may
    // also be specified within each shape of the visualization - see below

    let globalOpts = ['origin', 'rotation', 'scale'];

    // in case the children of the 'visual' key are numeric indices, we treat each one as a separate
    // subtree in its own right - otherwise, eachChild (defined in databaseWrappers.js) will just operate once on the whole subtree
    Misc.eachChild(visual, function(child) {

        // see if the subtree contains one or more shapes, so we can draw it
        if(child.shape) {
            let canvas = self.relation.canvas;

            // each subkey of 'shape' should be the name of a shape, eg. 'circle' or 'line' (see below);
            // within each shape, we look for the subkeys below specifying the parameters of the shape
            //
            //  - start = starting pixel with x & y subkeys
            //  - end = ending pixel
            //  - delta = difference between start and end - this replaces 'end'
            //  - direction = the rotation of the shape clockwise from the horizontal, in radians
            //  - length = length of the shape in pixels
            //
            // A shape may also specify its origin, rotation, and scale, thus overriding any values of these from
            // higher in the 'visual' subtree.
            //
            // These are the parameters that are common to many shapes.  Then each shape can look for its
            // own parameters, for example 'circle' expects a 'radius' - this happens within the switch statement below

            let shapeOpts = globalOpts.concat(['start', 'end', 'delta', 'direction', 'length']);
            for(let shapeName in child.shape) {

                // same as above, there may be multiple copies of this shape, in which case they are given
                // numeric indices - for example, under 'circle', there may be 'circle.0' and 'circle.1'
                Misc.eachChild(child.shape, shapeName, function(shape) {

                    // for the display parameters described above, we first check this specific shape, then the numeric index of
                    // the visual subtree if we are under one, then the visual subtree itself
                    let opts = {}, chain = [shape, child, visual];
                    shapeOpts.forEach(function(opt) {
                        chain.every(function(ctx) {
                            if(ctx.hasOwnProperty(opt)) {
                                opts[opt] = ctx[opt];
                                return false;
                            }
                            return true;
                        });
                    });

                    // store the display parameters in local variables for easy referencing
                    let origin = opts.origin, rotation = opts.rotation || 0, scale = opts.scale || 1,
                        start = opts.start, end = opts.end, delta = opts.delta,
                        direction = opts.direction, length = opts.length;

                    rotation = parseFloat(rotation);
                    scale = parseFloat(scale);
                    canvas.save();

                    // canvas is the HTML5 CanvasRenderingContext2D of the #visualization-context canvas
                    // (see its declaration at the end of initDiagram in diagram.js),
                    // so we apply the origin, rotation, and scale directly to it.  Then when we draw
                    // the shape it will automatically be transformed by these parameters.

                    if(origin) canvas.translate(origin.x, origin.y);
                    if(rotation) canvas.rotate(rotation);
                    canvas.lineWidth = 2 / scale;
                    if(scale) canvas.scale(scale, scale);

                    // now we draw the shape, using the common parameters parsed above as well as any that may need
                    // to be parsed for the specific shape type (as you can see, not all types have been implemented yet)

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

                    // undo the translation/rotation/scale on the canvas; otherwise, the next time visualization is run, the new
                    // transform will compound the previous one
                    canvas.restore();
                });
            }
        }
    });
    self.visualized = true;
};

