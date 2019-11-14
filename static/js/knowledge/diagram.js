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
                let concept = Concept.create();
                concept.addContext(self.concept);
                concept.updateNodes();
            });
            self.$wrapper.find('.law-create-button').click(function(e) {
                let concept = Concept.create({isLaw: true});
                concept.addContext(self.concept);
                concept.updateNodes();
            });
            self.$wrapper.find('.concept-level-up-button').click(function(e) {
                if(self.concept) {
                    let context = self.concept.getContext();
                    if(context.length === 1) self.open(context[0]);
                }
            });

            self.$card = self.$wrapper.find('.explorer-edit-concept');
            self.$conceptEditId = self.$card.find('.explorer-edit-concept-id');
            self.$nameEdit = self.$card.find('.explorer-edit-name');
            self.$descriptionEdit = self.$card.find('.explorer-edit-description');
            self.$instanceOfEdit = self.$card.find('.explorer-edit-instance-of').attr('id', 'explorer-edit-instance-of-' + this.id);
            self.instanceOfPalette = self.makePalette(self.$instanceOfEdit);

            Page.addExplorer(self);
        }

        function e(id) { return Page.explorers[id]; }
        function d(id) { return Page.explorers[id].getActiveDiagram(); }

        Explorer.prototype.getId = function() {
            return this.id;
        };

        Explorer.prototype.open = function(concept, mode) {
            this.$card.hide();
            this.concept = Concept.get(concept);
            let preferredMode = (this.concept && this.concept.isLaw()) ? 'graph' : 'palette';
            this.setMode(mode || preferredMode);
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

        Explorer.prototype.updateLayout = function() {
            if(!this.concept || this.mode !== 'graph') return;
            this.concept.layoutTree(this.getGraph());
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

            this.concept.eachContextOf(function(child) {
                child.addNodeData(diagram);
            });
        };

        Explorer.prototype.drawGraph = function(concept) {
            let self = this;
            if(self.drawingConceptTree) return;
            self.drawingConceptTree = true;

            let diagram = self.getGraph();
            concept = concept || self.concept;

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
                    concept = Concept.get(node);
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
                let c1 = Concept.get(e.subject.fromNode), c2 = Concept.get(e.subject.toNode);
                if(e.parameter) {
                    let portId = e.parameter.portId, cOld = Concept.get(e.parameter);
                    if(portId === 'T') cOld.removeContext(c2);
                    else if(portId === 'B') c1.removeContext(cOld);
                }
                if(c1 && c2) c1.addContext(c2);
            }
            graph.addDiagramListener('LinkDrawn', storeLink);
            graph.addDiagramListener('LinkRelinked', storeLink);

            graph.addDiagramListener('LayoutCompleted', function(e) {
                if(self.concept) self.concept.layoutTree(graph);
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
                    makeButton("Add child",
                        function(e, obj) {
                            let concept = Concept.get(obj.part.adornedPart),
                                child = Concept.create();
                            child.addContext(concept);
                            self.drawGraph();
                        },
                        function(o) {
                            let part = o.part.adornedPart;
                            return !(part.diagram instanceof go.Palette);
                        }),
                    makeButton("Open in new Explorer",
                        function(e, obj) {
                            let concept = Concept.get(obj.part.adornedPart);
                            if(concept) self.openInNew(concept, false);
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
                    /*toolTip:
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
                      )//*/
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
                        strokeWidth: 2,
                    },
                    new go.Binding('fill', 'isLaw', function(isLaw) {
                        if(isLaw) return 'yellow';
                        else return Page.nodeTemplates['default'].fill;
                    }),
                    new go.Binding("figure")),

                    // inside that is a text block displaying the node name if any, and the concept name
                    $$(go.TextBlock,
                    {
                        font: "bold 11pt Helvetica, Arial, sans-serif",
                        margin: 8,
                        maxSize: new go.Size(160, NaN),
                        wrap: go.TextBlock.WrapFit,
                        editable: false
                    },
                    // we use a function to determine what text the node will display
                    new go.Binding('text', '', function(data, node) {
                        return data.name + ' [' + data.id + ']';
                    }))
                ),
                // the port on top has an incoming link from my head node, and an outgoing link to my reference node
                makePort("T", go.Spot.Top, true, true),
                // port on the bottom has an outgoing arrow to nodes whose head I am,
                // and an incoming arrow from nodes whose reference I am
                makePort("B", go.Spot.Bottom, true, true),
                // handle mouse enter/leave events to show/hide the ports
                {
                    contextMenu: partContextMenu,
                    mouseEnter: function(e, node) { showSmallPorts(node, true); },
                    mouseLeave: function(e, node) { showSmallPorts(node, false); },
                    mouseDrop: function(e, node) {
                        console.log('dropped:');
                        let it = node.diagram.toolManager.draggingTool.copiedParts;
                        while(it.next()) {
                            console.log(it.value);
                        }
                    }
                }
            );

            // GoJS also needs a template to specify how links between nodes will appear
            graph.linkTemplate =
                $$(go.Link,
                  $$(go.Shape,
                    new go.Binding("stroke", "color"),
                    new go.Binding("strokeWidth", "width"),
                    /*new go.Binding("strokeDashArray", "", function(data, link) {
                        // if this is a link from the top of a node to the bottom of another, then it is pointing
                        // from a node to its reference; to distinguish these from head links, we make them dashed lines
                        if(data.fromPort === 'T') return [4, 4];
                        else return null;
                    })//*/
                  ),
                  $$(go.Shape, { toArrow: "standard", stroke: null })
                );

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
                let c1 = Concept.get(a), c2 = Concept.get(b);
                if(c1 && c2) {
                    let n1 = c1.getName(), n2 = c2.getName();
                    if(n1 && n2) return n1.localeCompare(n2);
                }
                return 0;
            };

            palette.model = $$(go.GraphLinksModel,
            {
                nodeKeyProperty: 'id'
            });

            self.postprocessDiagram(palette);

            return palette;
        };

        Explorer.prototype.postprocessDiagram = function(diagram) {
            let self = this;
            diagram.conceptExplorerId = self.id;

            let $div = $(diagram.div);

            if($div.hasClass('explorer-edit-instance-of')) {
                diagram.addDiagramListener('ExternalObjectsDropped', function(e) {
                    let editConcept = Concept.get(self.$conceptEditId.val());
                    if(!editConcept) return;
                    let it = e.subject.iterator;
                    console.log('dropped nodes');
                    while(it.next()) {
                        let node = it.value;
                        if(!(node instanceof go.Node)) continue;
                        console.log(node.data);
                        let concept = Concept.get(node);
                        if(concept) editConcept.addInstanceOf(concept);
                    }
                });
                diagram.addDiagramListener('SelectionDeleted', function(e) {
                    let editConcept = Concept.get(self.$conceptEditId.val());
                    if(!editConcept) return;
                    let it = e.subject.iterator;
                    while(it.next()) {
                        let concept = Concept.get(it.value);
                        if(concept) editConcept.removeInstanceOf(concept);
                    }
                });
            } else {
                diagram.addDiagramListener('ChangedSelection', function(e) {
                    let it = e.subject.iterator, node = null;
                    if(it.next()) node = it.value;
                    let concept = Concept.get(node);
                    if(!concept) {
                        self.$card.hide();
                        return;
                    }
                });
                diagram.addDiagramListener('TextEdited', function(e) {
                    let block = e.subject, node = block.part;
                    if(node instanceof go.Node) {
                        console.log('text edited, node is now ' + node.getDocumentBounds().width + ' wide');
                        let concept = Concept.get(node);
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
                            let concept = Concept.get(part);
                            if(concept) {
                                concept.delete();
                            }
                        }
                        else if(part instanceof go.Link) {
                            if(part.fromPortId === 'B') {
                                let concept = Concept.get(part.toNode);
                                if(concept) concept.setHead(null);
                            } else if(part.fromPortId === 'T') {
                                let concept = Concept.get(part.fromNode);
                                if(concept) concept.setReference(null);
                            }
                        }
                    }
                });

                if($div.hasClass('concept-graph')) {
                    diagram.addChangedListener(function(e) {
                        switch(e.change) {
                            case go.ChangedEvent.Property:
                                if(e.object instanceof go.Node) {
                                    let node = e.object, concept = Concept.get(node);
                                    if(concept && e.propertyName === 'position') {
                                        if(node.data.nodeWidth !== undefined &&
                                          node.data.nodeWidth !== node.getDocumentBounds().width) {
                                            console.log('node ' + concept.id + ' from ' + node.data.nodeWidth +
                                                ' to ' + node.getDocumentBounds().width);
                                            self.updateLayout();
                                        }
                                    }
                                }
                                break;
                        }
                    });
                }
                diagram.addDiagramListener('ObjectSingleClicked', function(e) {
                    let node = e.subject.part;
                    if(node instanceof go.Node) {
                        let concept = Concept.get(node);
                        if(!concept) return;
                        console.log('single click');
                        console.log(concept);
                        self.$conceptEditId.val('' + concept.getId());
                        self.$nameEdit.val(concept.get('name') || '');
                        self.$descriptionEdit.val(concept.get('description') || '');
                        Page.clearDiagram(self.instanceOfPalette);
                        concept.getInstanceOf().forEach(function(instanceOf) {
                            instanceOf.addNodeData(self.instanceOfPalette);
                        });

                        let $diagram = $(diagram.div), $parent = $diagram.parents().has(self.$card).first(),
                            diagramOffset = $diagram.offset(), parentOffset = $parent.offset();

                        let viewport = diagram.viewportBounds,
                            nodeBounds = node.getDocumentBounds(),
                            cardWidth = self.$card.width(),
                            x = nodeBounds.x + nodeBounds.width/2 - cardWidth/2 - viewport.x,
                            y = nodeBounds.y + nodeBounds.height - viewport.y;
                        x = Math.max(0, Math.min(x, viewport.width-cardWidth/2));
                        x += diagramOffset.left - parentOffset.left;
                        y += diagramOffset.top - parentOffset.top;

                        self.$card.css('left', '' + x + 'px');
                        self.$card.css('top', '' + y + 'px');
                        self.$card.show();
                    }
                });
                diagram.addDiagramListener('ObjectDoubleClicked', function(e) {
                    let node = e.subject.part;
                    if(node instanceof go.Node) {
                        let concept = Concept.get(node);
                        if(!concept) return;
                        self.open(concept);
                    }
                });
            }

            diagram.addDiagramListener('ViewportBoundsChanged', function(e) {
                diagram.position = new go.Point(-diagram.viewportBounds.width/2, -50);
            });
        };



        Page.explorers = {};

        Page.getExplorer = function(data) {
            if(data instanceof go.Diagram)
                data = data.conceptExplorerId;
            return Page.explorers[data];
        };

        Page.getActiveDiagram = function(e) {
            return Page.explorers[e].getActiveDiagram();
        };

        Page.clearDiagram = function(diagram) {
            Page.eachNode(diagram, function(node) {
                Concept.get(node).removeFromDiagram(diagram);
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
                Page.getExplorer(diagram).updateLayout();
            }
        };

        Concept.prototype.delete = function(diagram) {
            if(this.deleted) return;
            Record.prototype.delete.call(this);
            this.eachContextOf(function(child) {
                child.delete();
            });
            this.updateNodes();
        };

        Concept.prototype.getNode = function(diagram) {
            let node = diagram.findNodeForKey(this.getId());
            if(!node && this.oldId) node = diagram.findNodeForKey(this.oldId);
            return node;
        };

        Concept.prototype.inDiagram = function(diagram) {
            return diagram.findNodeForKey(this.getId()) ? true : false;
        };

        function n(c, e) { return Concept.get(c).getNode(Page.getActiveDiagram(e)); }

        Concept.prototype.createNodeData = function() {
            let self = this;
            return {
                id: self.id,
                name: self.name,
                isLaw: self.isLaw() ? true : false,
            };
        };

        Concept.prototype.addNodeData = function(diagram, drawLinks) {
            let self = this;

            let data = diagram.model.findNodeDataForKey(self.getId());
            if(data) return data;

            data = self.createNodeData();
            data.loc = '0 0';
            diagram.model.addNodeData(data);

            if(drawLinks) {
                self.eachContext(function(concept) {
                    diagram.model.addLinkData({
                        from: self.getId(),
                        to: concept.getId(),
                        fromPort: 'T',
                        toPort: 'B'
                    });
                });
            }

            return diagram.model.findNodeDataForKey(self.getId());
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
            let newData = self.createNodeData();
            for(let k in newData) diagram.model.set(data, k, newData[k]);

            let node = self.getNode(diagram);
            if(node) node.updateTargetBindings();
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

        function nd(c, e, k) { return Concept.get(c).getNodeData(Page.explorers[e].getActiveDiagram(), k); }
        function snd(c, e, k, v) { Concept.get(c).setNodeData(Page.explorers[e].getActiveDiagram(), k, v); }

        Concept.prototype.initTree = function(diagram) {
            let self = this;

            self.addNodeData(diagram, true);

            self.eachContextOf(function(child) {
                child.initTree(diagram);
            });
        };

        Concept.prototype.layoutTree = function(diagram) {
            let map = {}, rows = [];
            this.setGraphRow(diagram, map);

            for(let id in map) {
                let row = map[id];
                if(!rows[row]) rows[row] = [];
                rows[row].push(id);
            }

            rows.forEach(function(row, r) {
                let n = row.length, y = 100 * r;
                row.forEach(function(cid, i) {
                    let x = 200 * (i - (n-1)/2);
                    Concept.get(cid).setNodeData(diagram, 'loc', '' + x + ' ' + y);
                });
            });

            diagram.updateAllTargetBindings();
        };

        Concept.prototype.setGraphRow = function(diagram, map) {
            let self = this;
            if(!self.inDiagram(diagram)) return -1;

            let row = map[self.getId()];
            if(row > -1) return row;

            row = -1;
            self.eachContext(function(concept) {
                let contextRow = concept.setGraphRow(diagram, map);
                if(contextRow > row) row = contextRow;
            });
            map[self.getId()] = ++row;

            self.eachContextOf(function(child) {
                child.setGraphRow(diagram, map);
            });
            return row;
        };



