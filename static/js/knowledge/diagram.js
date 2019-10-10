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

        function Explorer() {
            let self = this;

            let i = 1;
            while(Page.explorers.hasOwnProperty(i)) i++;
            self.id = i;

            self.concept = null;

            self.$wrapper = $('#concept-explorer-template').clone().attr('id', 'concept-explorer-' + this.id).appendTo('#concept-wrapper');

            self.modes = {};
            self.$wrapper.find('.concept-mode').each(function(i, wrapper) {
                let $wrapper = $(wrapper), mode = $wrapper.attr('mode'), $diagram = $wrapper.find('.gojs-diagram');
                $diagram.attr('id', 'concept-' + mode + '-' + self.id);
                self.modes[mode] = {
                    wrapper: $wrapper,
                    diagram: mode == 'palette' ? self.makePalette($diagram) : self.makeGraph($diagram)
                };
            });

            self.$wrapper.find('.explorer-mode-button').click(function(e) {
                self.setMode($(this).attr('mode'));
            });
            self.$wrapper.find('.explorer-close-button').click(function(e) {
                self.exit();
            });

            self.$wrapper.find('.explorer-new-button').click(function(e) {
                let left = $(this).hasClass('explorer-new-left-button');
                self.openInNew(self.concept, left);
            });

            self.$wrapper.find('.concept-create-button').click(function(e) {
                let concept = Page.createConcept();
                concept.setHead(self.concept);
                concept.updateNodes();
            });
            self.$wrapper.find('.concept-level-up-button').click(function(e) {
                let head = null;
                if(self.concept) head = self.concept.getHead();
                if(head) self.open(head);
            });

            Page.addExplorer(this);
        }

        function e(id) { return Page.explorers[id]; }
        function d(id) { return Page.explorers[id].getActiveDiagram(); }

        Explorer.prototype.getId = function() {
            return this.id;
        };

        Explorer.prototype.open = function(concept, mode) {
            this.concept = Page.getConcept(concept);
            this.setMode(mode || this.mode || 'palette');
        };

        Explorer.prototype.exit = function() {
            this.$wrapper.remove();
            Page.removeExplorer(this);
        };

        Explorer.prototype.update = function() {
            if(!this.concept) return;

            let diagram = this.getActiveDiagram();
            if(diagram) switch(this.mode) {
                case 'palette':
                    this.fillPalette();
                    break;
                case 'graph':
                    this.drawGraph();
                    break;
                default: break;
            }
        };

        Explorer.prototype.toggleCloseButtons = function(show) {
            let $buttons = this.$wrapper.find('.explorer-close-button');
            if(show) $buttons.show();
            else $buttons.hide();
        };

        Explorer.prototype.setMode = function(mode) {
            if(mode !== this.mode) {
                let obj = this.modes[mode];
                if(!obj) return;
                this.$wrapper.find('.concept-mode').hide();
                obj.wrapper.show();
                this.mode = mode;
            }

            this.update();
            Page.updateExplorers();
        };

        Explorer.prototype.setPosition = function(explorer, before) {
            if(before) this.$wrapper.insertBefore(explorer.$wrapper);
            else this.$wrapper.insertAfter(explorer.$wrapper);
        };

        Explorer.prototype.openInNew = function(concept, before) {
            let explorer = new Explorer();
            explorer.open(concept);
            explorer.setPosition(this, before);
        };

        Explorer.prototype.clear = function(mode) {
            let self = this;
            let diagram = self.getActiveDiagram();
            if(diagram) Page.clearDiagram(diagram);
        };

        Explorer.prototype.getActiveDiagram = function() {
            return this.mode ? this.modes[this.mode].diagram : null;
        };

        Explorer.prototype.fillPalette = function() {
            let self = this, diagram = self.getPalette();

            Page.clearDiagram(diagram);

            this.concept.getHeadOf().forEach(function(child) {
                child.addNodeData(diagram);
            });
        };

        Explorer.prototype.drawGraph = function(concept) {
            let self = this, diagram = self.getGraph();
            concept = concept || self.concept;

            if(self.drawingConceptTree) return;
            self.drawingConceptTree = true;

            if(concept === self.concept) Page.clearDiagram(diagram);

            let nodeCount = diagram.nodes.count,
                treeCount = concept.getTreeCount(),
                listener = function(e) {
                    console.log('laid out ' + diagram.nodes.count + ' nodes');
                    if(diagram.nodes.count == nodeCount + treeCount) {
                        console.log('drawing tree for ' + treeCount + ' nodes');
                        console.log('graph height: ' + diagram.viewportBounds.height);
                        self.concept.layoutTree(diagram);
                        diagram.removeDiagramListener('LayoutCompleted', listener);
                        self.drawingConceptTree = false;
                    }
                };
            diagram.addDiagramListener('LayoutCompleted', listener);

            concept.initTree(diagram);
        };

        Explorer.prototype.getGraph = function() {
            return this.modes.graph.diagram;
        };

        Explorer.prototype.getPalette = function() {
            return this.modes.palette.diagram;
        };

        Explorer.prototype.makeGraph = function($div) {
            let self = this;

            let graph = $$(go.Diagram, $div.attr('id'),  // must name or refer to the DIV HTML element
            {
                position: new go.Point(0, -50),

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
                let node = e.diagram.selection.first(),
                    concept = Page.getConcept(node);
                if(!concept) return;

                let title = document.getElementById('node-title'), description = document.getElementById('node-description');
                title.textContent = "Node Info";
                description.innerHTML = concept.getInfoString().replace(new RegExp("\n", 'g'), "<br>");

                let symbol = concept.getSymbol();
                if(symbol)
                    $('#symbolization-wrapper').html('<p><math display="block" scriptlevel="-3">' + symbol + '</math></p>');
            }

            // dragging a node invalidates the Diagram.layout, causing a layout during the drag
            graph.toolManager.draggingTool.doMouseMove = function() {
                go.DraggingTool.prototype.doMouseMove.call(this);
                if (this.isActive) { graph.layout.invalidateLayout(); }
            }

            // when the diagram is modified, add a "*" to the page title in the browser, and enable the "Save" button
            graph.addDiagramListener("Modified", function(e) {
                console.log('diagram modified');
                var button = document.getElementById("graph-save-button");
                if (button) button.disabled = !graph.isModified;
                var idx = document.title.indexOf("*");
                if (graph.isModified) {
                    if (idx < 0) document.title += "*";
                } else {
                    if (idx >= 0) document.title = document.title.substr(0, idx);
                }
            });

            function storeLink(e) {
                let link = e.subject, c1 = Page.getConcept(link.fromNode), c2 = Page.getConcept(link.toNode);
                if(!c1 || !c2) return;
                if(link.fromPortId == 'B') {
                    c2.setHead(c1);
                } else {
                    c1.setReference(c2);
                }
            }
            graph.addDiagramListener('LinkDrawn', storeLink);
            graph.addDiagramListener('LinkRelinked', storeLink);

            graph.addDiagramListener('LayoutCompleted', function(e) {
                console.log('LAYOUTED');
                let concept = Page.currentConcept;
                if(concept) concept.layoutTree();
            });

            graph.addDiagramListener('ViewportBoundsChanged', function(e) {
                graph.position = new go.Point(-graph.viewportBounds.width/2, -50);
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
                            self.drawGraph(child);
                        },
                        function(o) {
                            let part = o.part.adornedPart;
                            return !(part.diagram instanceof go.Palette);
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
                                if(part.diagram instanceof go.Palette) return false;
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
                                if(part.diagram instanceof go.Palette) return false;
                                let concept = Page.getConcept(concept);
                                return concept && concept.inPredicate();
                            }),
                    makeButton("Open Graph",
                            function(e, obj) {
                                let concept = Page.getConcept(obj.part.adornedPart);
                                if(concept) new Explorer().open(concept, 'graph');
                            },
                            function(o) {
                                let part = o.part.adornedPart;
                                return part.diagram instanceof go.Palette;
                            })
              );

            /*
                This is the template GoJS will use to display nodes in the diagram.  This determines how nodes will appear.
                Also, GoJS stores a data object for each node, and the display of the node may change depending on
                its data values.  This happens through the Bindings you see in this template.
            */
            graph.nodeTemplate = $$(go.Node, "Spot",
                {
                    // if you set the "loc" key in the node data (see the binding below these brackets),
                    // that determines where the center of the node will appear in the diagram
                    locationSpot: go.Spot.Center,
                    // this is what appears when you hover the mouse over the node
                    toolTip:
                      $$(go.Adornment, "Auto",
                        $$(go.Shape, { fill: "#EFEFCC" }),
                        $$(go.TextBlock, { margin: 4, width: 140 },
                            // we pop up a box next to the cursor, showing some info about the node
                            new go.Binding("text", "", function(obj) {
                                let part = obj.part;
                                if (part instanceof go.Adornment) part = part.adornedPart;
                                let msg = "";
                                if (part instanceof go.Link) {
                                } else if (part instanceof go.Node) {
                                    msg = self.getNodeString(part.data.id);
                                }
                                return msg;
                            }).ofObject())
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
                        return data.name + ' [' + data.id + ']';
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
            graph.linkTemplate =
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

            graph.model = $$(go.GraphLinksModel,
            {
                nodeKeyProperty: 'id',
                linkFromPortIdProperty: 'fromPort',
                linkToPortIdProperty: 'toPort',
            });

            self.postprocessDiagram(graph);

            return graph;
        };


        Explorer.prototype.makePalette = function($div) {
            let self = this;

            // initialize the Palette that is on the left side of the page, which lists the concepts in the current framework
            let palette = $$(go.Palette, $div.attr('id'),  // must name or refer to the DIV HTML element
            {
                maxSelectionCount: 1,
                nodeTemplateMap: self.modes.graph.diagram.nodeTemplateMap,  // share the templates used by the diagram
                isReadOnly: false
            });

            // concepts in the palette will be displayed in alphabetical order
            palette.layout.comparer = function(a, b) {
                let c1 = Page.getConcept(a), c2 = Page.getConcept(b);
                if(c1 && c2) {
                    let n1 = c1.getName(), n2 = c2.getName();
                    if(n1 && n2) return n1.localeCompare(n2);
                }
                return 0;
            };

            palette.addDiagramListener('ObjectDoubleClicked', function(e) {
                let node = e.subject.part;
                if(node instanceof go.Node) {
                    let concept = Page.getConcept(node);
                    if(!concept) return;
                    if(concept.isRelation()) self.open(concept, 'graph');
                    else self.open(concept, 'palette');
                }
            });

            palette.model = $$(go.GraphLinksModel,
            {
                nodeKeyProperty: 'id'
            });

            self.postprocessDiagram(palette);

            return palette;
        };

        Explorer.prototype.postprocessDiagram = function(diagram) {
            diagram.addDiagramListener('TextEdited', function(e) {
                let block = e.subject, node = block.part;
                if(node instanceof go.Node) {
                    let concept = Page.getConcept(node);
                    if(concept) {
                        let name = block.text.replace(/\s+\[\d+\]$/, '');
                        concept.set('name', name);
                        concept.updateNodes();
                    }
                }
            });
            diagram.addDiagramListener('SelectionDeleted', function(e) {
                let it = e.subject.iterator;
                while(it.next()) {
                    let part = it.value;
                    if(part instanceof go.Node) {
                        let concept = Page.getConcept(part);
                        if(concept) {
                            concept.delete();
                        }
                    }
                    else if(part instanceof go.Link) {
                        if(part.fromPortId === 'B') {
                            let concept = Page.getConcept(part.toNode);
                            if(concept) concept.setHead(null);
                        } else if(part.fromPortId === 'T') {
                            let concept = Page.getConcept(part.fromNode);
                            if(concept) concept.setReference(null);
                        }
                    }
                }
            });
        };



        Page.explorers = {};

        Page.getExplorer = function(e) {
            return Page.explorers[e];
        }

        Page.getActiveDiagram = function(e) {
            return Page.explorers[e].getActiveDiagram();
        }

        Page.clearDiagram = function(diagram) {
            Page.eachNode(diagram, function(node) {
                Page.getConcept(node).removeFromDiagram(diagram);
            });
            diagram.requestUpdate();
        };

        Page.eachNode = function(diagram, callback) {
            let nodes = diagram.nodes;
            while(nodes.next()) {
                let node = nodes.value;
                callback.call(node, node);
            }
        };

        Page.eachExplorer = function(callback) {
            for(let e in Page.explorers) {
                callback.call(Page.explorers[e], Page.explorers[e], e);
            }
        };

        Page.eachActiveDiagram = function(callback) {
            for(let e in Page.explorers) {
                let explorer = Page.explorers[e],
                    diagram = explorer.getActiveDiagram();
                if(!diagram) continue;
                callback.call(diagram, diagram, e);
            }
        };

        Page.addExplorer = function(explorer) {
            Page.explorers[explorer.getId()] = explorer;
            Page.updateExplorers();
        };

        Page.removeExplorer = function(explorer) {
            delete Page.explorers[explorer.getId()];
            Page.updateExplorers();
        };

        Page.updateExplorers = function() {
            let show = Object.keys(Page.explorers).length > 1;
            Page.eachExplorer(function(explorer) {
                explorer.toggleCloseButtons(show);
                let diagram = explorer.getActiveDiagram();
                if(diagram) diagram.requestUpdate();
            });
        };


        Concept.prototype.removeFromDiagram = function(diagram) {
            let node = this.getNode(diagram);
            if(node) {
                links = node.findLinksConnected();
                diagram.model.removeNodeData(node.data);
                while(links.next()) {
                    let link = links.value;
                    diagram.model.removeLinkData(link.data);
                }
            }
        };

        Concept.prototype.delete = function(diagram) {
            if(this.deleted) return;
            Record.prototype.delete.call(this);
            this.getHeadOf().forEach(function(child) {
                child.delete();
            });
            this.updateNodes();
        };

        Concept.prototype.getNode = function(diagram) {
            let node = diagram.findNodeForKey(this.getId());
            if(!node && this.oldId) node = diagram.findNodeForKey(this.oldId);
            return node;
        };

        function n(c, e) { return Page.getConcept(c).getNode(Page.getActiveDiagram(e)); }

        Concept.prototype.addNodeData = function(diagram, drawLinks) {
            let self = this;

            diagram.model.addNodeData({
                id: self.id,
                name: self.name,
                loc: '0 0'
            });

            if(drawLinks) {
                let head = self.getHead(), ref = self.getReference();
                if(head) diagram.model.addLinkData({
                    from: head.getId(),
                    to: self.id,
                    fromPort: 'B',
                    toPort: 'T'
                });
                if(ref) diagram.model.addLinkData({
                    from: self.id,
                    to: ref.getId(),
                    fromPort: 'T',
                    toPort: 'B'
                });
            }

            return diagram.model.findNodeDataForKey(self.id);
        };

        Concept.prototype.updateNodes = function() {
            let self = this;
            Page.eachActiveDiagram(function(d, e) {
                console.log('concept ' + self.id + ' updating explorer ' + e);
                self.updateNode(d, !(d instanceof go.Palette));
            });
        };

        Concept.prototype.updateNode = function(diagram, drawLinks) {
            let self = this;
            if(self.deleted) {
                self.removeFromDiagram(diagram);
                return;
            }
            let data = self.getNodeData(diagram);
            if(!data) data = self.addNodeData(diagram, drawLinks);
            let newData = {
                id: self.id,
                name: self.name,
                head: self.head,
                reference: self.ref
            };
            console.log('node: ' + self.getNode(diagram).__gohashid)
            console.log(newData);
            for(let k in newData) diagram.model.set(data, k, newData[k]);
            diagram.updateAllTargetBindings();
        };

        Concept.prototype.getNodeData = function(diagram, key) {
            let data = diagram.model.findNodeDataForKey(this.getId());
            if(!data && this.oldId) data = diagram.model.findNodeDataForKey(this.oldId);
            if(data) return key === undefined ? data : data[key];
            return undefined;
        };

        Concept.prototype.setNodeData = function(diagram, key, value) {
            let data = this.getNodeData(diagram);
            if(data) {
                if(typeof key === 'object') {
                    for(let k in key) {
                        diagram.model.set(data, k, key[k]);
                    }
                } else {
                    diagram.model.set(data, key, value);
                }
            }
        };

        function nd(c, e, k) { return Page.getConcept(c).getNodeData(Page.explorers[e].getActiveDiagram(), k); }
        function snd(c, e, k, v) { Page.getConcept(c).setNodeData(Page.explorers[e].getActiveDiagram(), k, v); }

        Concept.prototype.getTreeCount = function() {
            let self = this, count = 1;
            self.getHeadOf().forEach(function(child) {
                count += child.getTreeCount();
            });
            return count;
        };

        Concept.prototype.initTree = function(diagram) {
            let self = this;

            self.addNodeData(diagram, true);

            self.getHeadOf().forEach(function(child) {
                child.initTree(diagram);
            });
        };

        Concept.prototype.layoutTree = function(diagram) {
            this.calculateTreeWidth(diagram);
            this.positionTree(diagram, 0, 0);
            diagram.updateAllTargetBindings();
        };

        Concept.prototype.positionTree = function(diagram, x, y) {
            let self = this, childTreeWidth = self.getNodeData(diagram, 'childTreeWidth');

            self.setNodeData(diagram, 'loc', '' + x + ' ' + y);

            let currentX = x - childTreeWidth / 2;

            self.getHeadOf().forEach(function(child) {
                let childWidth = child.getTreeWidth(diagram);
                child.positionTree(diagram, currentX + childWidth/2, y + 100);
                currentX += childWidth;
            });
        };

        Concept.prototype.calculateTreeWidth = function(diagram) {
            let self = this, node = self.getNode(diagram),
                nodeWidth = 0, childTreeWidth = 0, treeWidth = 0;

            if(node) nodeWidth = node.getDocumentBounds().width;

            self.getHeadOf().forEach(function(child) {
                childTreeWidth += child.calculateTreeWidth(diagram);
            });

            treeWidth = Math.max(nodeWidth > 0 ? nodeWidth + 30 : 0, childTreeWidth);

            self.setNodeData(diagram, {
                nodeWidth: nodeWidth,
                childTreeWidth: childTreeWidth,
                treeWidth: treeWidth
            });

            return treeWidth;
        };

        Concept.prototype.getTreeWidth = function(diagram) {
            return this.getNodeData(diagram, 'treeWidth');
        };





