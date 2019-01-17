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
    'vector' - visual.shape.line
            symbol.over = &rharu;
    'component' - A.visual.shape.line.delta += S.value * B.visual.delta
        In this 'component' example, A would be a vector and B a direction.  The 'delta' key
        stores a pixel difference and has keys 'x' and 'y'.  So this command looks for keys
        'x' and 'y' under any key on the right-hand side.
    'box' - visual.shape.clear()
            visual.shape.square.width = 30
    'sum' - value = A + B
            symbol = A + B

Visual data will vary widely. Often the first-level keys will be shapes: line, triangle,
arc, circle, rectangle, etc.  Each of these needs a sufficient set of subkeys to specify
how it is to be drawn.  A line, for instance, could be determined by a start pixel coupled
with either an end pixel, a pixel difference, or a length and direction.

*/