/*

A node can store various types of data: value, visual, symbol.  All data is stored in
a single JavaScript object, where each type is under its corresponding key and is further
specified by subkeys.

Additionally, a concept stores rules on how data flows through it.  For example,
an 'equal' node passes value data from its reference to its head.  An 'augment' node
adds the value of its reference to that of its head.  A 'product' node sets its own
value to the product of its head and reference values.

The parsing of data-flow rules is hard-coded.  A concept's rules consist of a set of
one-line commands, where each command can specify:

    a) which node this rule applies to, using 'S' for self, 'A' for head, 'B' for reference,
    'C' for all child nodes of which this node is the head, and composition of links with '.',
    and the whole thing surrounded by {{ }}.  For example, {{A.B}} refers to my head's reference,
    or {{C.B}} refers to all my children's references.  If not specified, the default is {{S}},
    ie. this node.

    b) which key of the data object is to be updated and how, in regular JS syntax.
    So 'visual.shape.line.start' under the visual data type refers to the starting pixel of the line
    in the node's visual representation.  Referenced subkeys that don't exist yet are automatically added.

Examples:

    Visual:
    'body' - visual.shape.circle.radius = 30
            C.symbol.subscript add A.symbol + B.symbol

    'box' - visual.shape clear
            visual.shape.square.width = 30
                -overrides the default shape provided by 'body' using the clear() function

    'vector' - visual.shape.line
            symbol.over = &rharu;

    'component' - A.visual.shape.line.delta += S.value * B.visual.delta

        In this 'component' example, A would be a vector and B a direction.  The 'delta' key
        stores a pixel difference and has keys 'x' and 'y'.  So this command looks for keys
        'x' and 'y' under any key on the right-hand side, which it finds in B.visual.delta
        (which represents the pixel delta of the direction's unit vector) and applies the 'x'
        of the latter to the 'x' of the former etc.

    'sum' - value = A + B
            symbol = A + B

Visual data will vary widely. Often the first-level keys will be shapes: line, triangle,
arc, circle, rectangle, etc.  Each of these needs a sufficient set of subkeys to specify
how it is to be drawn.  A line, for instance, could be determined by a start pixel coupled
with either an end pixel, a pixel difference, or a length and direction.

Any reference in a command to another node's data key is linked as a dependency.
When that key is resolved, its value, which will itself be a tree (a subtree of the dependent node's
data tree) will be passed back.  We have to somehow take all the dependent subtrees in a command
and combine them per the command operations.

In any part of a command that doesn't contain special operators, the only way to combine these
subtrees is if they have the same key structure.  For example, if there were a command 'delta += A.delta + B.delta',
and A and B's 'delta' subtrees had 'x' and 'y' nodes, this would resolve to
    delta.x += A.delta.x + B.delta.x
    delta.y += A.delta.y + B.delta.y
And the key being edited will receive any keys it doesn't yet have.

*/


Node.prototype.initData = function(type) {

};

Node.prototype.setupDataDependencies = function(type) {

    let self = this, concept = self.getConcept(), commands = concept.getCommands(type);

    commands.forEach(function(command) {

        let tokens = command.split(' '), targetStr = tokens[0];
        let parse = self.parseDataKey(targetStr),
            targets = self.getConnectedNodes(parse.nodes || 'S'),
            targetKey = parse.key;
        command = command.replace(targetStr, targetKey);

        targets.forEach(function(target) {
            target.createDataDependency(command);
        });
    });
};

Node.prototype.isDataKey = function(token) {
    let oneWord = token.match(/^[0-9A-Za-z]$/);
    if(oneWord) return NodeData.types.indexOf(token) >= 0;
    return token.match(/^[0-9A-Za-z\.]+$/) !== null;
};

Node.prototype.parseDataKey = function(str) {
    let self = this, parts = str.split('.'), nodeNames = ['S', 'A', 'B', 'C'], splitPos = 0;
    for(let i = 0; i < parts.length; i++) {
        if(nodeNames.indexOf(parts[i]) >= 0) splitPos += parts[i].length + 1;
        else break;
    }
    let nodes = str.substring(0, Math.max(splitPos-1, 0)), dataKey = str.substring(splitPos);
    return {nodes: nodes, key: dataKey};
};

//generate a syntax tree from a node data command
Node.prototype.splitDataCommand = function(command) {
    /* TODO */
};

Node.prototype.createDataDependency = function(command) {
    let dep = new NodeDataDependency(this, command);
    dep.init();
};

Node.prototype.addTrigger = function(node, key) {
    Misc.setIndex(this.dataTriggers, key, node.getId(), node);
};


function NodeDataDependency(node, command) {
    this.id = null;
    this.node = node;
    this.command = command;
    this.originalCommand = command;
    this.waiting = {};
    this.values = {'sub': {}, 'all': {}};
    this.tree = {};
}

NodeDataDependency.prototype.init = function() {
    let self = this, tokens = this.command.split(' '), key = tokens.shift(), op = tokens.shift(), sources = [];

    let specialOps = ['add', 'clear'];
    if(specialOps.indexOf(op) >= 0) this.tree[op] = [key, tokens.join(' ')];
    else this.tree = this.command;

    for(let i = 2; i < tokens.length; i++) {
        if(self.node.isDataKey(tokens[i])) sources.push(self.node.parseDataKey(tokens[i]));
    }
    sources.forEach(function(source) {
        self.wait(source.nodes[0], source.key);
    });
};

NodeDataDependency.prototype.wait = function(node, key) {
    Misc.setIndex(this.waiting, node.getId(), key, true);
    node.addTrigger(this, key);
};

NodeDataDependency.prototype.resolve = function(node, key, value) {
    let nodeId = node.getId(), keyStr = '' + nodeId + key;

    if(typeof value === 'object') {
        for(let k in value) {
            Misc.setIndex(this.values, 'sub', k, keyStr, value[k]);
        }
    } else {
        Misc.setIndex(this.values, 'all', keyStr, value);
    }

    Misc.deleteIndex(this.waiting, nodeId, key);
    if(Object.keys(this.waiting).length === 0) {
        this.resolveCommand();
    }
};

NodeDataDependency.prototype.resolveCommand = function() {
    for(let k in this.values.sub) this.resolveTree(this.tree, k);
    this.resolveTree(null);
};

NodeDataDependency.prototype.resolveTree = function(tree, index) {

    if(typeof tree !== 'object') {
        tree = '' + tree;
        let values = index === null ? this.values.all : this.values.sub[index];
        for(let keyStr in values) tree = tree.replace(keyStr, values[keyStr]);
        return eval(tree);
    }

    let op = Object.keys(tree)[0], args = tree[op], resolvedArgs = [];
    args.forEach(function(arg) {
        resolvedArgs.push(self.resolveTree(arg, index));
    });
    switch(op) {
        case 'add':
            break;
        case 'clear':
            break;
        default:
            break;
    }
};

