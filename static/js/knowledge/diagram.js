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
        Relation.prototype.initDiagram = function() {
            let self = this;

            // create the diagram canvas in the #graph-canvas element (defined in knowledge.html)
            self.diagram = $$(go.Diagram, "graph-canvas",  // must name or refer to the DIV HTML element
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
                var graphNode = e.diagram.selection.first();
                if (!(graphNode instanceof go.Node)) return;
                var data = graphNode.data;
                var title = document.getElementById('node-title');
                var description = document.getElementById('node-description');

                let node = self.findEntry('node', data.id);
                if(!node) return;

                title.textContent = "Node Info";
                description.innerHTML = self.getNodeString(node.id).replace(new RegExp("\n", 'g'), "<br>");

                let symbol = node.getData().getValue('symbol');
                if(symbol)
                    $('#symbolization-wrapper').html('<p><math display="block" scriptlevel="-3">' + symbol + '</math></p>');
            }

            // dragging a node invalidates the Diagram.layout, causing a layout during the drag
            self.diagram.toolManager.draggingTool.doMouseMove = function() {
              go.DraggingTool.prototype.doMouseMove.call(this);
              if (this.isActive) { this.diagram.layout.invalidateLayout(); }
            }

            // when the diagram is modified, add a "*" to the page title in the browser, and enable the "Save" button
            self.diagram.addDiagramListener("Modified", function(e) {
              var button = document.getElementById("graph-save-button");
              if (button) button.disabled = !self.diagram.isModified;
              var idx = document.title.indexOf("*");
              if (self.diagram.isModified) {
                if (idx < 0) document.title += "*";
              } else {
                if (idx >= 0) document.title = document.title.substr(0, idx);
              }
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
                    // give a node a name or rename it if it already has one
                    makeButton("Rename",
                            function(e, obj) {
                                let part = obj.part.adornedPart;
                                if(!(part instanceof go.Node)) return;
                                let name = prompt('Enter new name');
                                if(name) self.setNodeData(part.data.id, 'name', name);
                            },
                            function(o) {
                                let part = o.part.adornedPart;
                                return part.diagram === self.diagram;
                            }),
                    // either pick a new concept for this node or create a new one;
                    // by default, the 'concept' modal is brought up in the 'Create' tab,
                    // but with all the fields copied from the node's current concept (so you
                    // are creating a modified copy of this node's current concept), and the
                    // new concept you create is marked as specific to this node (not accessible
                    // from the palette).  But you can switch to the 'Select' tab, and pick an
                    // exisiting concept for this node instead.
                    makeButton("Change Concept",
                            function(e, obj) {
                                let part = obj.part.adornedPart;
                                if(!(part instanceof go.Node)) return;
                                let node = self.findEntry('node', part.data.id);
                                if(!(node instanceof Node)) return;
                                let currentConcept = node.getConcept(),
                                    callback = function(concept) {
                                        if(concept && concept != currentConcept.id)
                                            self.setNodeData(part.data.id, 'concept', concept);
                                    };
                                if(currentConcept.node_specific) {
                                    self.editEntry('concept', currentConcept, {
                                        callback: callback,
                                        enabledTabs: ['edit', 'search'],
                                    });
                                } else {
                                    self.duplicateEntry('concept', currentConcept, {
                                        callback: callback,
                                        enabledTabs: ['create', 'search'],
                                        fields: {
                                            id: '',
                                            node_specific: true,
                                        }
                                    });
                                }
                            },
                            function(o) {
                                let part = o.part.adornedPart;
                                return part.diagram === self.diagram;
                            }),
                    // this is if you want to edit the global concept record of the node.  Any changes you make
                    // here will apply to all nodes that have this concept.
                    makeButton("Edit Concept",
                            function(e, obj) {
                                let part = obj.part.adornedPart;
                                if(!(part instanceof go.Node)) return;
                                self.editEntry('concept', part.data.concept);
                            },
                            function(o) {
                                return true;
                            }),
                    // give the node a value consisting of a set of real numbers
                    // enter it as a semi-colon delimited list of intervals and numbers,
                    // where square brackets represent a closed interval and parentheses an open interval (see example below)
                    // We may want to eliminate intervals and have each node allowed only one number as its value;
                    // this depends on what concepts we have
                    makeButton("Set Values",
                            function(e, obj) {
                                let part = obj.part.adornedPart;
                                if(!(part instanceof go.Node)) return;
                                let input = prompt("Enter a set of real numbers in interval notation, e.g. [0.5,2];5.7;[3,9);(9,17)");
                                let value = new Value(input);
                                if(value.empty()) return;
                                part.data.value = input;
                                if(self.nodes.hasOwnProperty(part.data.id)) self.nodes[part.data.id].setValue(input);
                            },
                            function(o) {
                                let part = o.part.adornedPart;
                                return part.diagram === self.diagram;
                            }),
                    // add the node to the currently selected predicate set;
                    // either this option or the 'Remove from Predicate' below will be displayed, but not both,
                    // depending on whether the node is currently in the predicate set
                    makeButton("Add to Predicate",
                            function(e, obj) {
                                let part = obj.part.adornedPart;
                                if(part instanceof go.Node) self.togglePredicate(parseInt(part.data.id), true);
                            },
                            function(o) {
                                let part = o.part.adornedPart;
                                if(part.diagram !== self.diagram) return false;
                                if(part instanceof go.Node) return self.currentPredicate >= 0 && !self.inPredicate(parseInt(part.data.id));
                                return false;
                            }),
                    makeButton("Remove from Predicate",
                            function(e, obj) {
                                let part = obj.part.adornedPart;
                                if(part instanceof go.Node) self.togglePredicate(parseInt(part.data.id), false);
                            },
                            function(o) {
                                let part = o.part.adornedPart;
                                if(part.diagram !== self.diagram) return false;
                                if(part instanceof go.Node) return self.inPredicate(parseInt(part.data.id));
                                return false;
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
            self.diagram.nodeTemplate = $$(go.Node, "Spot",
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
                  $$(go.Shape, self.nodeTemplates['default'].shape,  // default figure
                    {
                      cursor: "pointer",
                      fill: self.nodeTemplates['default'].fill,  // default color
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
                    new go.Binding("text", "", function(data, node) {

                        // in the palette, each node just represents a concept from our framework
                        if(node.diagram === self.palette) return self.concepts[data.concept].name;

                        // if the node has a name, the text will be the node name followed
                        // by the concept name in brackets; otherwise, just the concept name
                        let text = '';
                        if(typeof data.name == 'string' && data.name.length > 0) {
                            text = data.name;
                        }
                        if(data.concept && self.concepts.hasOwnProperty(data.concept)) {
                            let conceptName = self.concepts[data.concept].name;
                            if(text) conceptName = ' [' + conceptName + ']';
                            text += conceptName;
                        }
                        //text += ' [' + data.id + ']';
                        return text;
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
            self.diagram.linkTemplate =
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
            self.palette = $$(go.Palette, "concept-palette",  // must name or refer to the DIV HTML element
            {
                maxSelectionCount: 1,
                nodeTemplateMap: self.diagram.nodeTemplateMap,  // share the templates used by the diagram
            });

            // concepts in the palette will be displayed in alphabetical order
            self.palette.layout.comparer = function(a, b) {
                let c1 = a.data.concept, c2 = b.data.concept;
                if(c1 && c2 && self.concepts.hasOwnProperty(c1) && self.concepts.hasOwnProperty(c2))
                    return self.concepts[c1].name.localeCompare(self.concepts[c2].name);
                return 0;
            };

            // initialize the nodes that are in the palette according to the concepts we have currently loaded, if any
            self.setPaletteModel();
            // initially the diagram should be clear, ready for the user to load a law or create their own
            self.clearDiagram();

            // below the diagram is the HTML5 canvas that will be used to visualize the relation
            // (the canvas is created in knowledge.html, and visualization happens in represent.js)
            let canvas = document.getElementById('visualization-canvas');
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            self.canvas = canvas.getContext('2d');
        };


        // create one node in the palette for each concept we have currently loaded from the server, but only
        // display those from the currently active framework
        Relation.prototype.setPaletteModel = function() {
            let self = this, concepts = self.concepts;
            let dataArray = [];
            // loop through all concepts we have in memory
            for(let id in concepts) {
                let concept = concepts[id];
                // create a node for that concept in the palette
                dataArray.push({
                    concept: concept.id,
                    framework: concept.framework,
                    // but only display it if that concept is from the current framework
                    visible: self.framework && (self.framework.id <= 0 || concept.framework == self.framework.id)
                });
            }
            // overwrite any nodes the palette had previously with this new set
            self.palette.model = $$(go.GraphLinksModel, {
                nodeDataArray: dataArray,
                // we don't link nodes inside the palette; we link them in the diagram
                linkDataArray: []
            });
        };


        // when the user switches to a different framework, or filters which framework is visible in the palette
        // using the .framework-filter dropdown next to the palette, we make sure only concepts from the selected
        // framework are visible
        Relation.prototype.filterPalette = function(framework) {
            let self = this;

            // if the .framework-filter dropdown was changed, we will be passed the new framework to display;
            // otherwise, we are just displaying the currently active framework
            if(framework === undefined) {
                if(self.framework) framework = self.framework.id;
                else return;
            }
            self.paletteFramework = framework;

            // if the filter dropdown was not set, we will display concepts from the current framework and all its dependencies;
            // here we get the list of those dependencies
            let frameworks = [];
            if(framework < 0) {
                frameworks.push(undefined);
                if(self.framework.id >= 0) frameworks.push(self.framework.id);
                let ind = 1;
                while(ind < frameworks.length) {
                    let f = frameworks[ind];
                    for(let dep in self.frameworks[f].dependencies) {
                        if(frameworks.indexOf(dep) < 0) frameworks.push(dep);
                    }
                    ind++;
                }
            // but if the filter was set, we only display concepts from the framework chosen in the filter, not its dependencies
            } else frameworks.push(framework);

            self.paletteFrameworks = frameworks;

            // now that we have the list of frameworks whose concepts should be visible, we go through each concept in the
            // palette and determine whether it is visible
            self.palette.nodes.each(function(node) {
                self.palette.model.set(node.data, 'visible', self.isVisibleInPalette(node.data.concept));
            });
        }


        // helper function to determine whether a given concept should be visible in the palette
        Relation.prototype.isVisibleInPalette = function(conceptId) {
            let self = this, concept = self.concepts[conceptId];
            if(concept.law > 0) return concept.law == self.law.id;
            for(let i = 0; i < self.paletteFrameworks.length; i++)
                if(self.paletteFrameworks[i] == concept.framework)
                    return true;
            return false;
        };


        // remove all nodes and links from the diagram
        Relation.prototype.clearDiagram = function() {
            let self = this;
            self.diagram.model = $$(go.GraphLinksModel,
            {
                nodeKeyProperty: 'id',
                linkFromPortIdProperty: 'fromPort',
                linkToPortIdProperty: 'toPort',
            });
        };


        // if the user loads an existing law, we call this function to attempt to display it in the diagram,
        // such that parent nodes are above their child nodes and nodes are not on top of each other.  Currently
        // it uses a simple algorithm which doesn't always look great, so it could stand to be improved.
        Relation.prototype.draw = function() {
            let self = this;
            // get rid of any nodes currently in the diagram
            self.diagram.removeParts(self.diagram.nodes);

            // create a dummy node with an id of -1 to represent the root of the whole tree (in case there
            // are multiple nodes without parents in the law, they will all be children of this node).
            // Then create an 'meta' object for each node which will store the information needed to draw it.
            let rootNodes = [];
            let nodeMeta = {'-1': {children: []}};
            self.law.nodes.forEach(function(node) {
                nodeMeta[node] = {children: []};
            });
            // first, store each node's children in its meta object.  Also, nodes with no parents
            // are marked as level 0, meaning they will be drawn in the top row of the diagram
            self.law.nodes.forEach(function(node) {
                if(node < 0) return;
                let head = self.nodes[node].head, root = !head;
                nodeMeta[root ? -1 : head].children.push(node);
                if(root) nodeMeta[node].level = 0;
            });

            // recursively calculate the 'width of the subtree' of each node.  For example, if a node
            // has 2 children and each of these has 3 children, there will be 6 children in the bottom row
            // of the subtree, so we allot 600 pixels of width to that node.
            let horizontal = 100, vertical = 100;
            let getOffsets = function(node) {
                let nc = nodeMeta[node].children.length, width = horizontal;
                if(nc > 0) {
                    width = 0;
                    nodeMeta[node].children.forEach(function(child) {
                        nodeMeta[child].offset = width;
                        width += getOffsets(child);
                    });
                    // also since we have the children in an ordered list, we assign each
                    // child its slot within that allotted subtree width
                    nodeMeta[node].children.forEach(function(child) {
                        nodeMeta[child].offset -= width / 2 - horizontal / 2;
                    });
                }
                nodeMeta[node].width = width;
                return width;
            };
            getOffsets(-1);

            // now that we know where each node will appear relative to its parent, we can recursively draw all nodes,
            // starting with the dummy (invisible) -1 node in the top center of the diagram
            let drawNodes = function(node, x, y) {
                if(node >= 0) {
                    self.drawNode(node, { // this function is defined below
                        loc: '' + x + ' ' + y,
                    });
                }
                nodeMeta[node].children.forEach(function(child) {
                    drawNodes(child, x + nodeMeta[child].offset, y + vertical);
                });
            };
            drawNodes(-1, self.diagram.viewportBounds.width/2, 50);

            // after that we draw the links between parent and child nodes
            let drawLinks = function(node) {
                if(node >= 0) self.drawLinks(node); // defined below
                nodeMeta[node].children.forEach(function(child) {
                    drawLinks(child);
                });
            };
            drawLinks(-1);

            // we store the list of the law's predicate sets in the global relation object; as predicate sets are modified
            // in the diagram, this global object will be updated; then, when we save the law, the law's predicate sets will
            // be set to the contents of the global object before saving
            self.predicateSets = [];
            $('#set-predicate').children().slice(1, -1).remove();
            if(self.law.predicates) {
                for(let group in self.law.predicates) {
                    $('#set-predicate > option:last-child').before('<option value="' + (group-1) + '">Predicate ' + group + '</option>');
                    let obj = {};
                    for(let node in self.law.predicates[group]) obj[node] = true;
                    self.predicateSets.push(obj);
                }
            }
        };


        // draw the specified node - its pixel location in the diagram and any other display options are
        // passed in the options parameter
        Relation.prototype.drawNode = function(nodeId, options) {

            let self = this, node = self.findEntry('node', nodeId);
            if(!node || node.drawn) return;

            if(!options) options = {};
            let template = {};

            // which shape, color, etc. to use for this node - the possibilities are listed in
            // the nodeTemplates member defined in the Relation constructor in knowledge.html
            if(options.template) {
                if(self.nodeTemplates.hasOwnProperty(options.template))
                    template = self.nodeTemplates[options.template];
            }
            // whether to draw the links from this node to its parents
            let drawLinks = options.drawLinks ? true : false;

            // remove the above two options from the object; the rest of the keys in the options object
            // will be directly included in the node data object that we pass to GoJS; the effects of these
            // keys can be seen in the bindings within the GoJS node template defined above in initDiagram
            delete options.template;
            delete options.drawLinks;

            // any keys within the node record, the options parameter, or the template from nodeTemplates,
            // are put into the GoJS node data object
            let nodeData = Object.assign({}, node, options, template);
            // if the node has a numeric/interval value, that is stringified and put in the data as well
            nodeData.value = node.value.writeValue();

            // if the location of the node has not yet been specified, place it horizontally in the midpoint
            // between its two parents and vertically 75 pixels below the lower of its two parents
            if(!nodeData.hasOwnProperty('loc')) {
                let x = 0, y = 0;
                for(let i = 0; i < 2; i++) {
                    let parent = i == 0 ? nodeData.head : nodeData.reference;
                    if(!parent) continue;
                    let parentData = self.diagram.model.findNodeDataForKey(parent);
                    if(parentData && parentData.loc) {
                        let parentLoc = parentData.loc.split(' ');
                        if(!isNaN(parentLoc[0])) x += parseFloat(parentLoc[0]);
                        if(!isNaN(parentLoc[1])) y = Math.max(y, parseFloat(parentLoc[1]));
                    }
                }
                nodeData.loc = '' + (x/2) + ' ' + (y+75);
            }

            // when we add the data object to GoJS's model for the diagram, GoJS will automatically display it using that data
            self.diagram.model.addNodeData(nodeData);

            // optionally draw the links to the parents now that the node is displayed
            if(drawLinks) self.drawLinks(nodeId);
            node.drawn = true;
        };


        // draw arrows from the given node in the diagram to its head and reference nodes; a solid arrow will
        // be drawn from the head to the node, and a dashed arrow will be drawn from the node to its reference
        // (the solid/dashed is specified in the GoJS link template in initDiagram above)
        Relation.prototype.drawLinks = function(nodeId) {
            let self = this, node = self.nodes[nodeId];
            if(node.head) {
                self.diagram.model.addLinkData({from: node.head, to: node.id, fromPort: 'B', toPort: 'T'});
            }
            if(node.reference) {
                self.diagram.model.addLinkData({from: node.id, to: node.reference, fromPort: 'T', toPort: 'B'});
            }
        };


        // set which of the templates from Relation.nodeTemplates (defined in the Relation constructor in knowledge.html)
        // will be used to display the given node - determines its shape, color, etc. on screen
        Relation.prototype.setNodeTemplate = function(node, template) {
            let self = this;
            if(!self.nodeTemplates.hasOwnProperty(template)) return false;
            if(typeof node != 'object') {
                if(isNaN(node)) return false;
                node = self.diagram.model.findNodeDataForKey(node);
                if(!node) return false;
            }
            let nodeTemplate = self.nodeTemplates[template];
            // treat the template as a list of key/values that should be set in the GoJS node data object for this node
            for(let property in nodeTemplate) {
                self.diagram.model.setDataProperty(node, property, nodeTemplate[property]);
            }
        };


        // set the specified key of the GoJS data object for the given node
        Relation.prototype.setNodeData = function(nodeId, attr, value) {
            console.log('setting node ' + nodeId + ' ' + attr + ' to ' + value);
            let self = this, node = self.nodes[nodeId];
            if(node) node[attr] = value;
            let data = self.diagram.model.findNodeDataForKey(nodeId);
            if(data) self.diagram.model.set(data, attr, value);
        };


        // for the given node, construct a string that gives a bunch of information about that node
        // this will be displayed in the #node-description side panel of the diagram when a node is clicked on
        // (see onSelectionChanged above), or in a popup text box next to the cursor when a node is hovered over
        // (see infoString above)
        Relation.prototype.getNodeString = function(id) {

            let self = this, node = self.nodes[id], law = self.law;
            if(!node) return '';

            let lawStr = '';
            if(law) lawStr = law.name + ' [' + law.id + ']';
            else lawStr = 'none';

            let predicates = '';
            for(let group in self.predicateSets) {
                if(self.predicateSets[group].hasOwnProperty(id)) {
                    let groupStr = '';
                    for(let n in self.predicateSets[group]) groupStr += '' + n + ',';
                    predicates += groupStr.substring(0, groupStr.length-1) + '; ';
                }
            }
            if(predicates == '') predicates = 'none';
            else predicates = predicates.substring(0, predicates.length-2);

            let mappings = '';
            if(mappings == '') mappings = 'none';
            else mappings = "\n" + mappings;

            msg = 'ID: ' + node.id + "\n"
                + 'Law: ' + lawStr + "\n"
                + 'Predicates: ' + predicates + "\n"
                + 'Values: ' + node.value.toString() + "\n"
                + 'Mappings: ' + mappings;
            return msg;
        };


        // replace the nodes and connections of the current law with whatever the user has constructed in the diagram.
        // ie. if they have deleted or added nodes from the diagram, or changed which node is a parent of which node,
        // make those changes in the records of those nodes in memory.  This is needed whenever we are saving or
        // evaluating the current relation.

        Relation.prototype.syncGraph = function() {
            let self = this, graphNodes = [];

            // prepare each node record of the current law to be updated
            self.law.eachNode(function(node) {
                node.preprocess();
            });

            // for any node in the diagram that doesn't have a record in memory, create the corresponding record
            self.diagram.nodes.each(function(node) {
                let id = parseInt(node.data['id']);
                self.findOrCreateEntry('node', id);
                if(graphNodes.indexOf(id) < 0) graphNodes.push(id);
            });

            // now that there is a record for each node in the diagram, go through all the nodes in the diagram
            // and make sure its record is up to date in terms of concept, name, value, and links to its parents
            self.diagram.nodes.each(function(node) {
                let id = parseInt(node.data['id']);
                let entry = self.findEntry('node', id);
                let head = node.findNodesInto('T'),
                    reference = node.findNodesOutOf('T');
                head = head.count > 0 ? head.first().data['id'] : null;
                reference = reference.count > 0 ? reference.first().data['id'] : null;
                entry.store({
                    concept: node.data['concept'],
                    name: node.data['name'] || null,
                    value: node.data['value'],
                    head: head,
                    reference: reference
                });
            });

            // any node record from the law that is no longer on the diagram, delete the record
            self.law.eachNode(function(node) {
                if(graphNodes.indexOf(node.id) < 0) node.remove();
            });

            // the list of nodes in the law should now match that from the diagram
            self.law.nodes = graphNodes;

            // perform any required post-update actions on each node
            self.law.eachNode(function(node) {
                node.postprocess();
            });
        };
