/*
    These functions pertain to the middle section of the page, where the user can visually manipulate a law's tree.
    First, there is a palette on the left side containing all concepts from the framework currently in use;
    on the right side is a diagram canvas.  The user drags the concept they want from the palette into the diagram,
    and a node is created with that concept.  They can drag the nodes around to arrange them.  If they drag from the bottom
    of a node to the top of another node, the first node becomes the head of the second.  From the top of one node to
    the bottom of another, the first node becomes the reference of the second.  All of this functionality is handled
    by the GoJS plugin.

    Above the palette/diagram there is a dropdown menu to select one of the law's predicate sets to edit, or create a new one.
    The user adds nodes to the predicate or removes them from it by right clicking on the node; the deep predicate nodes
    for the currently selected set are highlighted yellow.

    When the user right-clicks a node they have other options as well, such as giving a name to the node, changing its value, etc.
*/



        /*
            initDiagram: called once from knowledge.html to create the palette and diagram canvas; creates the global templates that will
            be used to display all nodes and links in the diagram.

            Anywhere in this file, '$$' is short for GoJS's go.GraphObject.make function (this was assigned in knowledge.html).
            See GoJS documentation at https://gojs.net/latest/index.html
        */
        Page.initDiagram = function() {
            // create the diagram canvas in the #graph-canvas element (defined in knowledge.html)
            Page.diagram = $$(go.Diagram, "graph-canvas",  // must name or refer to the DIV HTML element
            {
                // the canvas has a grid as a background; set the parameters for this
                grid: $$(go.Panel, "Grid",
                      $$(go.Shape, "LineH", { stroke: "lightgray", strokeWidth: 0.5 }),
                      $$(go.Shape, "LineH", { stroke: "gray", strokeWidth: 0.5, interval: 10 }),
                      $$(go.Shape, "LineV", { stroke: "lightgray", strokeWidth: 0.5 }),
                      $$(go.Shape, "LineV", { stroke: "gray", strokeWidth: 0.5, interval: 10 })
                    ),

                // allow the user to drag concepts from the palette and drop them in the diagram
              allowDrop: true,

              // other options for the diagram
              "draggingTool.dragsLink": true,
              "draggingTool.isGridSnapEnabled": true,
              "linkingTool.isUnconnectedLinkValid": true,
              "linkingTool.portGravity": 20,
              "relinkingTool.isUnconnectedLinkValid": true,
              "relinkingTool.portGravity": 20,
              "relinkingTool.fromHandleArchetype":
                $$(go.Shape, "Diamond", { segmentIndex: 0, cursor: "pointer", desiredSize: new go.Size(8, 8), fill: "tomato", stroke: "darkred" }),
              "relinkingTool.toHandleArchetype":
                $$(go.Shape, "Diamond", { segmentIndex: -1, cursor: "pointer", desiredSize: new go.Size(8, 8), fill: "darkred", stroke: "tomato" }),
              "linkReshapingTool.handleArchetype":
                $$(go.Shape, "Diamond", { desiredSize: new go.Size(7, 7), fill: "lightblue", stroke: "deepskyblue" }),
              //rotatingTool: $(TopRotatingTool),  // defined below
              //"rotatingTool.snapAngleMultiple": 15,
              //"rotatingTool.snapAngleEpsilon": 15,
              "undoManager.isEnabled": true,

              // when the user clicks on a node, call a function to display information about that node
              "ChangedSelection": onSelectionChanged
            });

            // display information about a node when the user clicks on it, in a div to the right of the diagram
            function onSelectionChanged(e) {
                let graphNode = e.diagram.selection.first(),
                    concept = Page.getConcept(graphNode);
                if(!concept) return;

                let title = document.getElementById('node-title'), description = document.getElementById('node-description');
                title.textContent = "Node Info";
                description.innerHTML = concept.getInfoString().replace(new RegExp("\n", 'g'), "<br>");

                let symbol = concept.getSymbol();
                if(symbol)
                    $('#symbolization-wrapper').html('<p><math display="block" scriptlevel="-3">' + symbol + '</math></p>');
            }

            // dragging a node invalidates the Diagram.layout, causing a layout during the drag
            Page.diagram.toolManager.draggingTool.doMouseMove = function() {
                go.DraggingTool.prototype.doMouseMove.call(this);
                if (this.isActive) { this.diagram.layout.invalidateLayout(); }
            }

            // when the diagram is modified, add a "*" to the page title in the browser, and enable the "Save" button
            Page.diagram.addDiagramListener("Modified", function(e) {
                console.log('diagram modified');
                var button = document.getElementById("graph-save-button");
                if (button) button.disabled = !Page.diagram.isModified;
                var idx = document.title.indexOf("*");
                if (Page.diagram.isModified) {
                    if (idx < 0) document.title += "*";
                } else {
                    if (idx >= 0) document.title = document.title.substr(0, idx);
                }
            });

            let editListener = function(e) {
                console.log('diagram edited: ' + e.name);
                switch(e.name) {
                    case 'TextEdited':
                        let node = e.subject.part;
                        if(node instanceof go.Node) {
                            console.log('node is now ' + node.getDocumentBounds().width + ' wide');
                        }
                        break;
                    case 'SelectionDeleted':
                        let it = e.subject.iterator;
                        while(it.next()) {
                            let part = it.value;
                            if(part instanceof go.Node) {
                                let concept = Page.getConcept(part);
                                if(concept) {
                                    concept.getHeadOf().forEach(function(child) {
                                        child.removeFromDiagram();
                                    });
                                }
                            }
                        }
                        break;
                    default: break;
                }
            };
            Page.diagram.addDiagramListener('TextEdited', editListener);
            Page.diagram.addDiagramListener('SelectionDeleted', editListener);

            Page.diagram.addDiagramListener('LayoutCompleted', function(e) {
                console.log('LAYOUTED');
                let concept = Page.currentConcept;
                if(concept) concept.layoutTree();
            });

            // called in the node template below to create the top and bottom 'port' on each node;
            // the user can press on this port and drag to the port of another node to create a link between them
            function makePort(name, spot, output, input, fromMax, toMax) {
                // the port is basically just a small transparent square
                var options =
                {
                    fill: null,  // not seen, by default; set to a translucent gray by showSmallPorts, defined below
                    stroke: null,
                    desiredSize: new go.Size(12, 12),
                    alignment: spot,  // align the port on the main Shape
                    alignmentFocus: spot,  // just inside the Shape
                    portId: name,  // declare this object to be a "port"
                    fromSpot: spot, toSpot: spot,  // declare where links may connect at this port
                    fromLinkable: output, toLinkable: input,  // declare whether the user may draw links to/from here
                    cursor: "pointer",  // show a different cursor to indicate potential link point
                };
                if(fromMax !== undefined) options.fromMaxLinks = fromMax;
                if(toMax !== undefined) options.toMaxLinks = toMax;
                return $$(go.Shape, "Circle", options);
            }

            function showSmallPorts(node, show) {
              node.ports.each(function(port) {
                if (port.portId !== "") {  // don't change the default port, which is the big shape
                  port.fill = show ? "rgba(0,0,0,.3)" : null;
                }
              });
            }

            // generic function to create an option within the context menu of a node
            function makeButton(text, action, visiblePredicate) {
                return $$("ContextMenuButton",
                       $$(go.TextBlock, text),
                       { click: action },
                       // don't bother with binding GraphObject.visible if there's no predicate
                       visiblePredicate ? new go.Binding("visible", "", function(o, e) { return o.diagram ? visiblePredicate(o, e) : false; }).ofObject() : {});
            }

            // here is the template that is used as the context menu for each node
            let partContextMenu =
              $$(go.Adornment, "Vertical",
                    makeButton("Add Child",
                        function(e, obj) {
                            let concept = Page.getConcept(obj.part.adornedPart),
                                child = Page.createConcept();
                            child.setHead(concept);
                            child.initTree();
                            Page.currentConcept.layoutTree();
                        },
                        function(o) {
                            let part = o.part.adornedPart;
                            return part.diagram === Page.diagram;
                        }),
                    // add the node to the currently selected predicate set;
                    // either this option or the 'Remove from Predicate' below will be displayed, but not both,
                    // depending on whether the node is currently in the predicate set
                    makeButton("Add to Predicate",
                            function(e, obj) {
                                let concept = Page.getConcept(obj.part.adornedPart);
                                if(concept) concept.togglePredicate(true);
                            },
                            function(o) {
                                let part = o.part.adornedPart;
                                if(part.diagram !== Page.diagram) return false;
                                let concept = Page.getConcept(concept);
                                return concept && !concept.inPredicate();
                            }),
                    makeButton("Remove from Predicate",
                            function(e, obj) {
                                let concept = Page.getConcept(obj.part.adornedPart);
                                if(concept) concept.togglePredicate(false);
                            },
                            function(o) {
                                let part = o.part.adornedPart;
                                if(part.diagram !== Page.diagram) return false;
                                let concept = Page.getConcept(concept);
                                return concept && concept.inPredicate();
                            })
              );

            // the string to display when a node is clicked on, to provide information about that node
            let infoString = function(obj) {
                let part = obj.part;
                if (part instanceof go.Adornment) part = part.adornedPart;
                let msg = "";
                if (part instanceof go.Link) {
                    msg = "";
                } else if (part instanceof go.Node) {
                    msg = self.getNodeString(part.data.id);
                }
                return msg;
            };


            /*
                This is the template GoJS will use to display nodes in the diagram.  This determines how nodes will appear.
                Also, GoJS stores a data object for each node, and the display of the node may change depending on
                its data values.  This happens through the Bindings you see in this template.
            */
            Page.diagram.nodeTemplate = $$(go.Node, "Spot",
                {
                    // if you set the "loc" key in the node data (see the binding below these brackets),
                    // that determines where the center of the node will appear in the diagram
                    locationSpot: go.Spot.Center,
                    // this is what appears when you hover the mouse over the node
                    toolTip:
                      $$(go.Adornment, "Auto",
                        $$(go.Shape, { fill: "#EFEFCC" }),
                        $$(go.TextBlock, { margin: 4, width: 140 },
                            // we pop up a box next to the cursor, showing some info about the node using the infoString function above
                            new go.Binding("text", "", infoString).ofObject())
                      )
                },
                // the 'loc' data key is parsed into a go.Point object, and this determines the location of the node on screen;
                // specifically, it determines the center of the node on screen, per the 'locationSpot' option above.  Also,
                // when you drag the node to a new position, its new center pixel is stringified and stored as its 'loc' data key
                new go.Binding("location", "loc", go.Point.parse).makeTwoWay(go.Point.stringify),
                // use the boolean 'visible' data key to show or hide a node
                new go.Binding("visible", "visible"),
                // not really used right now
                new go.Binding("angle").makeTwoWay(),

                // the main object is a Panel which contains a Shape surrounding a TextBlock
                $$(go.Panel, "Auto",
                    { name: "PANEL" },
                    new go.Binding("desiredSize", "size", go.Size.parse).makeTwoWay(go.Size.stringify),

                    // the default shape will be a rounded rectangle (see the nodeTemplates member in knowledge.html)
                    $$(go.Shape, Page.nodeTemplates['default'].shape,  // default figure
                    {
                        cursor: "pointer",
                        fill: Page.nodeTemplates['default'].fill,  // default color
                        strokeWidth: 2
                    },
                    new go.Binding("figure"),
                    new go.Binding("fill")),

                    // inside that is a text block displaying the node name if any, and the concept name
                    $$(go.TextBlock,
                    {
                        font: "bold 11pt Helvetica, Arial, sans-serif",
                        margin: 8,
                        maxSize: new go.Size(160, NaN),
                        wrap: go.TextBlock.WrapFit,
                        editable: true
                    },
                    // we use a function to determine what text the node will display
                    new go.Binding('text', '', function(data, node) {
                        if(node.diagram === Page.palette) {
                            return data.name;
                        } else {
                            return data.name + ' [' + data.id + ']';
                        }
                    }).makeTwoWay(function(text, data, model) {
                        model.setDataProperty(data, 'name', text);
                        let concept = Page.getConcept(data.id);
                        if(concept) concept.set('name', text);
                    }))
                ),
                // the port on top has an incoming link from my head node, and an outgoing link to my reference node
                makePort("T", go.Spot.Top, true, true, 1, 1),
                // port on the bottom has an outgoing arrow to nodes whose head I am,
                // and an incoming arrow from nodes whose reference I am
                makePort("B", go.Spot.Bottom, true, true),
                // handle mouse enter/leave events to show/hide the ports
                {
                    mouseEnter: function(e, node) { showSmallPorts(node, true); },
                    mouseLeave: function(e, node) { showSmallPorts(node, false); },
                    contextMenu: partContextMenu
                }
            );

            // GoJS also needs a template to specify how links between nodes will appear
            Page.diagram.linkTemplate =
                $$(go.Link,
                  $$(go.Shape,
                    new go.Binding("stroke", "color"),
                    new go.Binding("strokeWidth", "width"),
                    new go.Binding("strokeDashArray", "", function(data, link) {
                        // if this is a link from the top of a node to the bottom of another, then it is pointing
                        // from a node to its reference; to distinguish these from head links, we make them dashed lines
                        if(data.fromPort === 'T') return [4, 4];
                        else return null;
                    })
                ));

            // initialize the Palette that is on the left side of the page, which lists the concepts in the current framework
            Page.palette = $$(go.Palette, "concept-palette",  // must name or refer to the DIV HTML element
            {
                maxSelectionCount: 1,
                nodeTemplateMap: Page.diagram.nodeTemplateMap,  // share the templates used by the diagram
            });

            // concepts in the palette will be displayed in alphabetical order
            Page.palette.layout.comparer = function(a, b) {
                let c1 = Page.getConcept(a), c2 = Page.getConcept(b);
                if(c1 && c2) return c1.getName().localeCompare(c2.getName());
                return 0;
            };

            Page.palette.model = $$(go.GraphLinksModel,
            {
                nodeKeyProperty: 'id'
            });
            Page.diagram.model = $$(go.GraphLinksModel,
            {
                nodeKeyProperty: 'id',
                linkFromPortIdProperty: 'fromPort',
                linkToPortIdProperty: 'toPort',
            });

            // below the diagram is the HTML5 canvas that will be used to visualize the relation
            // (the canvas is created in knowledge.html, and visualization happens in represent.js)
            let canvas = document.getElementById('visualization-canvas');
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            Page.canvas = canvas.getContext('2d');
        };

        Page.clearPalette = function() {

            Page.palette.model.nodeDataArray = [
                {name: 'Instance Of', isGroup: true},
                {name: 'Relations', isGroup: true}
            ];
        };

        Page.clearDiagram = function() {
            Page.eachNode(function(node) {
                Page.getConcept(node).removeFromDiagram();
            });
            Page.diagram.requestUpdate();
        };

        Page.eachNode = function(callback) {
            let nodes = Page.diagram.nodes;
            while(nodes.next()) {
                let node = nodes.value;
                callback.call(node, node);
            }
        };


        Concept.prototype.removeFromDiagram = function() {
            this.width = 0;
            this.treeWidth = 0;
            let node = this.getNode(), links = node.findLinksConnected();
            Page.diagram.model.removeNodeData(node.data);
            while(links.next()) {
                let link = links.value;
                Page.diagram.model.removeLinkData(link.data);
            }
        };

        Concept.prototype.load = function() {
            let self = this;

            // clear the palette
            let groups = Page.palette.findTopLevelGroups();
            while(groups.next()) {
                let group = groups.value;
                let sub = group.findSubGraphParts();
                let parts = sub.iterator;
                while(parts.next()) {
                    let part = parts.value;
                    let data = Page.palette.model.findNodeDataForKey(part.key);
                    if(data) Page.palette.model.removeNodeData(data);
                }
            }

            // all my instances
            self.getInstances().forEach(function(instance) {
                instance.addToPalette('Instance Of');
            });

            // all relations in which the given concept is instantiated
            //self.getRelations().forEach(function(relation) {
            //    relation.addToPalette('Relations');
            //});

            self.drawTree();

            Page.currentConcept = this;
        };


        Concept.prototype.addToPalette = function(group) {
            let self = this;
            Page.palette.model.addNodeData({
                group: group,
                id: self.id,
                name: self.name
            });
        };

        Concept.prototype.getNode = function() {
            return Page.diagram.findNodeForKey(this.getId());
        };

        Concept.prototype.getNodeData = function(key) {
            let data = Page.diagram.model.findNodeDataForKey(this.getId());
            if(data) return key === undefined ? data : data[key];
            return undefined;
        };

        Concept.prototype.setNodeData = function(key, value) {
            let data = Page.diagram.model.findNodeDataForKey(this.getId());
            if(data) Page.diagram.model.set(data, key, value);
        };

        Concept.prototype.drawTree = function() {
            if(Page.drawingTree) return;
            Page.drawingTree = true;
            let self = this;

            Page.clearDiagram();

            let treeCount = self.getTreeCount(), listener = function(e) {
                console.log('laid out ' + Page.diagram.nodes.count + ' nodes');
                if(Page.diagram.nodes.count == treeCount) {
                    console.log('drawing tree for ' + treeCount + ' nodes');
                    self.layoutTree();
                    Page.diagram.removeDiagramListener('LayoutCompleted', listener);
                    Page.drawingTree = false;
                }
            };
            Page.diagram.addDiagramListener('LayoutCompleted', listener);
            self.initTree();
        };

        Concept.prototype.getTreeCount = function() {
            let self = this, count = 1;
            self.getHeadOf().forEach(function(child) {
                count += child.getTreeCount();
            });
            return count;
        };

        Concept.prototype.initTree = function(x, y) {
            let self = this;

            if(x === undefined) {
                x = 0;
                y = -Page.diagram.viewportBounds.height / 2 + 50;
            }

            Page.diagram.model.addNodeData({
                id: self.id,
                name: self.name,
                loc: '' + x + ' ' + y
            });

            let head = self.getHead(), ref = self.getReference();
            if(head) Page.diagram.model.addLinkData({
                from: head.getId(),
                to: self.id,
                fromPort: 'B',
                toPort: 'T'
            });
            if(ref) Page.diagram.model.addLinkData({
                from: self.id,
                to: ref.getId(),
                fromPort: 'T',
                toPort: 'B'
            });

            self.getHeadOf().forEach(function(child) {
                child.initTree(x, y);
            });
        };

        Concept.prototype.layoutTree = function(x, y) {
            if(x === undefined) {
                x = 0;
                y = -Page.diagram.viewportBounds.height / 2 + 50;
            }
            this.calculateTreeWidth();
            this.positionTree(x, y);
            Page.diagram.updateAllTargetBindings();
        };

        Concept.prototype.positionTree = function(x, y) {
            let self = this;

            self.setNodeData('loc', '' + x + ' ' + y);

            let currentX = x - self.childTreeWidth / 2;

            self.getHeadOf().forEach(function(child) {
                let childWidth = child.getTreeWidth();
                child.positionTree(currentX + childWidth/2, y + 100);
                currentX += childWidth;
            });
        };

        Concept.prototype.calculateTreeWidth = function() {
            let self = this, node = self.getNode();

            if(node) self.nodeWidth = node.getDocumentBounds().width;
            else self.nodeWidth = 0;

            self.childTreeWidth = 0;
            self.getHeadOf().forEach(function(child) {
                self.childTreeWidth += child.calculateTreeWidth();
            });

            self.treeWidth = Math.max(self.nodeWidth > 0 ? self.nodeWidth + 30 : 0, self.childTreeWidth);
            return self.treeWidth;
        };

        Concept.prototype.getTreeWidth = function() {
            return this.treeWidth;
        };

