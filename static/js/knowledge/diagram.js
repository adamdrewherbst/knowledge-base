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

            self.node = null;

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
                self.openInNew(self.node, left);
            });

            self.$wrapper.find('.concept-create-button').click(function(e) {
                let node = Part.create();
                node.addLink(Concept.in, self.node);
                node.updatePage();
            });
            self.$wrapper.find('.law-create-button').click(function(e) {
                let node = Part.create();
                node.addLink(Concept.in, self.node);
                node.addLink(Concept.isA, 'law');
                node.updatePage();
            });
            self.$wrapper.find('.concept-level-up-button').click(function(e) {
                if(self.node) {
                    let context = self.node.getAll('>in>*'), keys = Object.keys(context);
                    if(keys.length === 1) self.open(context[keys[0]]);
                }
            });

            self.$showLinks = self.$wrapper.find('.explorer-show-links');
            self.$showLinksId = self.$showLinks.find('.explorer-show-links-id');
            self.$showInternal = self.$showLinks.find('.explorer-show-internal');
            self.$showExternal = self.$showLinks.find('.explorer-show-external');
            self.$showMeta = self.$showLinks.find('.explorer-show-meta');
            self.$showLinks.find('input[type="checkbox"]').change(function(e) {
                let part = Part.get(self.$showLinksId.val());
                if(!part) return;
                let $this = $(this), show = $this.prop('checked');
                let type = this.className.split('-')[2];
                part.eachLink(function(link, direction) {
                    let end = link.getEndpoint(direction);
                    if(!end) return;
                    switch(type) {
                        case 'internal':
                            if(direction !== 'incoming' || !self.includes[end.getId()]) return;
                            break;
                        case 'external':
                            if(direction !== 'outgoing' || self.includes[end.getId()]) return;
                            break;
                        case 'meta':
                            if(!end.isMeta()) return;
                            break;
                    }
                    self.showHidePart(end, show);
                });
            });

            self.partEditing = null;
            self.$partEdit = self.$wrapper.find('.explorer-edit-concept');
            self.$nameEdit = self.$partEdit.find('.explorer-edit-name');
            self.$descriptionEdit = self.$partEdit.find('.explorer-edit-description');
            self.$instanceOfEdit = self.$partEdit.find('.explorer-edit-instance-of').attr('id', 'explorer-edit-instance-of-' + this.id);
            self.instanceOfPalette = self.makePalette(self.$instanceOfEdit);

            self.$nameEdit.change(function(e) {
                self.partEditing.setName(self.$nameEdit.val());
            });
            self.$descriptionEdit.change(function(e) {
                self.partEditing.setDescription(self.$descriptionEdit.val());
            });

            self.setMode('graph');
            self.showingMeta = {};

            Page.addExplorer(self);
        }

        function e(id) { return Page.explorers[id]; }
        function d(id) { return Page.explorers[id].getActiveDiagram(); }

        Explorer.prototype.getId = function() {
            return this.id;
        };

        Explorer.prototype.getNode = function() {
            return this.node;
        };

        Explorer.prototype.open = function(node, mode) {
            this.$partEdit.hide();
            this.node = Part.get(node);
            let preferredMode = (this.node && this.node.hasLink(Concept.isA, 'law')) ? 'graph' : this.mode;
            this.setMode(mode || preferredMode);
        };

        Explorer.prototype.exit = function() {
            this.$wrapper.remove();
            Page.removeExplorer(this);
        };

        Explorer.prototype.update = function() {
            let self = this;
            if(!self.node) return;

            let diagram = this.getActiveDiagram();
            if(!diagram) return;

            Page.clearDiagram(diagram);

            self.data = {};
            self.setData(self.node, 'shown', self.node, true, true);
        };

        Explorer.prototype.updateLayout = function() {
            if(!this.node || this.mode !== 'graph') return;
            this.getGraph().invalidateLayout();
        };

        Explorer.prototype.toggleCloseButtons = function(show) {
            let $buttons = this.$wrapper.find('.explorer-close-button');
            if(show) $buttons.show();
            else $buttons.hide();
        };

        Explorer.prototype.getMode = function() {
            return this.mode;
        };

        Explorer.prototype.setMode = function(mode) {
            if(mode !== this.mode) {
                let obj = this.modes[mode];
                if(!obj) return;
                this.$wrapper.find('.concept-mode').hide();
                obj.wrapper.show();
                this.mode = mode;
                this.$wrapper.attr('diagram-mode', mode);
            }

            this.update();
            Page.updateExplorers();
        };

        Explorer.prototype.setPosition = function(explorer, before) {
            if(before) this.$wrapper.insertBefore(explorer.$wrapper);
            else this.$wrapper.insertAfter(explorer.$wrapper);
        };

        Explorer.prototype.openInNew = function(node, before) {
            let explorer = new Explorer();
            explorer.open(node);
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

        Explorer.prototype.getGraph = function() {
            return this.modes.graph.diagram;
        };

        Explorer.prototype.getPalette = function() {
            return this.modes.palette.diagram;
        };


        // This variation on ForceDirectedLayout does not move any selected Nodes
        // but does move all other nodes (vertexes).
        function ContinuousForceDirectedLayout() {
          go.ForceDirectedLayout.call(this);
          this._isObserving = false;
          this.explorer = null;
        }
        go.Diagram.inherit(ContinuousForceDirectedLayout, go.ForceDirectedLayout);

        ContinuousForceDirectedLayout.prototype.isFixed = function(v) {
            let part = Part.get(v.node);
            if(part && this.explorer && this.explorer.node === part) return true;
            return v.node.isSelected;
        }

        // optimization: reuse the ForceDirectedNetwork rather than re-create it each time
        ContinuousForceDirectedLayout.prototype.doLayout = function(coll) {
            if (!this._isObserving) {
                this._isObserving = true;
                // cacheing the network means we need to recreate it if nodes or links have been added or removed or relinked,
                // so we need to track structural model changes to discard the saved network.
                var lay = this;
                this.diagram.addModelChangedListener(function(e) {
                  // modelChanges include a few cases that we don't actually care about, such as
                  // "nodeCategory" or "linkToPortId", but we'll go ahead and recreate the network anyway.
                  // Also clear the network when replacing the model.
                  if (e.modelChange !== "" ||
                    (e.change === go.ChangedEvent.Transaction && e.propertyName === "StartingFirstTransaction")) {
                    lay.network = null;
                  }
                });
            }
          var net = this.network;
          if (net === null) {  // the first time, just create the network as normal
            this.network = net = this.makeNetwork(coll);
          } else {  // but on reuse we need to update the LayoutVertex.bounds for selected nodes
            this.diagram.nodes.each(function(n) {
              var v = net.findVertex(n);
              if (v !== null) v.bounds = n.actualBounds;
            });
          }
          // now perform the normal layout
          go.ForceDirectedLayout.prototype.doLayout.call(this, coll);
          // doLayout normally discards the LayoutNetwork by setting Layout.network to null;
          // here we remember it for next time
          this.network = net;
        }
        // end ContinuousForceDirectedLayout


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

                layout: $$(ContinuousForceDirectedLayout, {
                    explorer: self,
                    maxIterations: 200,
                    defaultSpringLength: 30,
                    defaultElectricalCharge: 100,
                    defaultGravitationalMass: 100
                }),

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
            });

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
                let start = Part.get(e.subject.fromNode), end = Part.get(e.subject.toNode), link = null;
                if(!start || !end) return;
                if(e.name === 'LinkRelinked') {
                    link = Part.get(e.subject);
                    if(link && link.isLink()) link.setEndpoints(start, end);
                    else link = null;
                } else {
                    let concept = null;
                    if(!start.isMeta() && end.isMeta()) concept = Concept.in;
                    link = Part.create({
                        concept: concept,
                        start: start,
                        end: end
                    });
                    graph.model.set(e.subject.data, 'id', link.getId());
                }
                if(link) link.updatePage();
            }
            graph.addDiagramListener('LinkDrawn', storeLink);
            graph.addDiagramListener('LinkRelinked', storeLink);

            graph.addDiagramListener('LayoutCompleted', function(e) {
            });

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
                            let node = Part.get(obj.part.adornedPart),
                                child = Part.create({
                                    concept: Concept.create()
                                });
                            if(self.node) child.addLink(Concept.in, self.node);
                            if(node !== self.node) child.addLink(null, node);
                            child.updatePage();
                        },
                        function(o) {
                            let part = o.part.adornedPart;
                            return !(part.diagram instanceof go.Palette) && (part instanceof go.Node);
                        }),
                    makeButton("Edit",
                        function(e, obj) {
                            let part = Part.get(obj.part.adornedPart);
                            if(part) self.editPart(part);
                        },
                        function(o) {
                            return true;
                        }),
                    makeButton('Hide',
                        function(e, obj) {
                            let part = Part.get(obj.part.adornedPart);
                            if(part) self.showHidePart(part, false);
                        }, function(obj) {
                            let part = Part.get(obj.part.adornedPart);
                            return part && part !== self.node;
                        }),
                    makeButton('Collapse',
                        function(e, obj) {

                        },
                        function(obj) {

                        }),
                    makeButton('Show/Hide Links...',
                        function(e, obj) {
                            let part = Part.get(obj.part.adornedPart);
                            if(part) self.showLinks(part);
                        },
                        function(obj) {
                            return obj.part.adornedPart instanceof go.Node;
                        }),
                    makeButton("Open",
                        function(e, obj) {
                            let node = Part.get(obj.part.adornedPart);
                            if(node) self.open(node);
                        },
                        function(o) {
                            return o.part.adornedPart instanceof go.Node;
                        }),
                    makeButton("Open in new Explorer",
                        function(e, obj) {
                            let node = Part.get(obj.part.adornedPart);
                            if(node) self.openInNew(node, false);
                        },
                        function(o) {
                            return o.part.adornedPart instanceof go.Node;
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
                    $$(go.Shape, 'RoundedRectangle',  // default figure
                    {
                        cursor: "pointer",
                        strokeWidth: 2,
                        portId: '',
                        fromLinkable: true,
                        toLinkable: true,
                        fromLinkableDuplicates: true,
                        toLinkableDuplicates: true
                    },
                    new go.Binding('fill', '', function(data, node) {
                        if(data.isMeta) return '#cc3';
                        return '#6c6';
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
                        let name = data.name || '', isA = '';
                        if(data.isA) for(let id in data.isA) {
                            isA += data.isA[id].getName() + ',';
                        }
                        if(isA.length > 1) name += ' (' + isA.substring(0, isA.length-1) + ')';
                        return (name || '...') + ' [' + data.id + ']';
                    }))
                ),
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
                    $$(go.Shape, { toArrow: "standard", stroke: null }),
                    $$(go.Panel, "Auto",
                        $$(go.Shape,  // the label background, which becomes transparent around the edges
                            {
                                fill: $$(go.Brush, "Radial",
                                    {
                                        0: "rgb(240, 240, 240)",
                                        0.3: "rgb(240, 240, 240)",
                                        1: "rgba(240, 240, 240, 0)"
                                    }
                                ),
                                stroke: null
                            }
                        ),
                        $$(go.TextBlock,  // the label text
                            {
                                textAlign: "center",
                                font: "14pt helvetica, arial, sans-serif",
                                stroke: "#555555",
                                margin: 10
                            },
                            new go.Binding("text", "name")
                        )
                    ),
                    {
                        contextMenu: partContextMenu
                    }
                );

            graph.model = $$(go.GraphLinksModel,
            {
                nodeKeyProperty: 'id',
                linkKeyProperty: 'id',
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
                    if(!self.partEditing) return;
                    let it = e.subject.iterator;
                    console.log('dropped nodes');
                    while(it.next()) {
                        let node = it.value;
                        if(!(node instanceof go.Node)) continue;
                        console.log(node.data);
                        let otherPart = Part.get(node);
                        if(otherPart) self.partEditing.addLink(Concept.isA, otherPart);
                    }
                });
                diagram.addDiagramListener('SelectionDeleted', function(e) {
                    if(!self.partEditing) return;
                    let it = e.subject.iterator;
                    while(it.next()) {
                        let otherPart = Part.get(it.value);
                        if(otherPart) self.partEditing.removeLink(Concept.isA, otherPart);
                    }
                });
            } else {
                diagram.addDiagramListener('ExternalObjectsDropped', function(e) {
                    if(!self.node) return;
                    let it = e.subject.iterator;
                    console.log('dropped nodes');
                    while(it.next()) {
                        let parent = Part.get(it.value);
                        console.log(it.value.data);
                        console.log(parent);
                        if(!parent || !parent.isNode()) continue;
                        let node = Part.create();
                        self.showingMeta[node.getId()] = true;
                        diagram.model.set(it.value.data, 'id', node.getId());
                        node.addLink(parent.getMainLinkType(), self.node);
                        node.addLink(Concept.isA, parent);
                        node.updatePage();
                    }
                });
                diagram.addDiagramListener('ChangedSelection', function(e) {
                    let it = e.subject.iterator, node = null;
                    if(it.next()) node = it.value;
                    let part = Part.get(node);
                    if(!part) {
                        self.$partEdit.hide();
                        self.$showLinks.hide();
                        return;
                    }
                });
                diagram.addDiagramListener('TextEdited', function(e) {
                    let block = e.subject, goPart = block.part, part = Part.get(goPart);
                    if(!part) return;
                    let concept = part.getConcept();
                    if(!concept) return;
                    let name = block.text.replace(/\s+\[\d+\]$/, '');
                    concept.set('name', name);
                    concept.updatePage();
                });
                diagram.addDiagramListener('SelectionDeleted', function(e) {
                    let it = e.subject.iterator;
                    while(it.next()) {
                        let goPart = it.value, part = Part.get(goPart);
                        if(part) part.delete();
                    }
                });
                diagram.addDiagramListener('ObjectSingleClicked', function(e) {
                    let goPart = e.subject.part, part = Part.get(goPart);
                });
                diagram.addDiagramListener('ObjectDoubleClicked', function(e) {
                    let goPart = e.subject.part, part = Part.get(goPart);
                    if(part) self.open(part);
                });

                if($div.hasClass('concept-graph')) {
                    diagram.addDiagramListener('ViewportBoundsChanged', function(e) {
                        diagram.position = new go.Point(-diagram.viewportBounds.width/2, -diagram.viewportBounds.height/2);
                    });
                } else if($div.hasClass('concept-palette')) {
                    diagram.addDiagramListener('ViewportBoundsChanged', function(e) {
                        diagram.position = new go.Point(-diagram.viewportBounds.width/2, -50);
                    });
                }
            }
        };

        Explorer.prototype.editPart = function(part) {
            let self = this;
            self.partEditing = part;
            self.$nameEdit.val(part.getName() || '');
            self.$descriptionEdit.val(part.getDescription() || '');
            Page.clearDiagram(self.instanceOfPalette);
            part.eachOutgoing([Concept.isA, '*'], function(node) {
                node.addGoData(self.instanceOfPalette);
            });
            self.showCard(self.$partEdit, part);
        };

        Explorer.prototype.showLinks = function(part) {
            let self = this, $showList = self.$showLinks.find('.explorer-show-hide-individual').empty();
            part.eachLink(function(link, direction, neighbor) {
                let type = self.getLinkType(link),
                    showable = (type === 'primary' || type === 'secondary') && direction === 'incoming'
                        && !self.hasData(link, 'hidden', neighbor);
                showable = showable || type === 'external';
                if(showable) {
                    let $checkbox = $('<input type="checkbox" class="explorer-show-individual">');
                }
            });
            self.$showLinksId.val(part.getId());
            self.showCard(self.$showLinks, part);
        };

        Explorer.prototype.showCard = function($card, part) {
            let self = this, diagram = self.getActiveDiagram();
            let goPart = part.getGoPart(diagram);
            let $diagram = $(diagram.div), $parent = $diagram.parents().has(self.$partEdit).first(),
                diagramOffset = $diagram.offset(), parentOffset = $parent.offset();
            let viewport = diagram.viewportBounds,
                nodeBounds = goPart.getDocumentBounds(),
                cardWidth = $card.width(), cardHeight = $card.height(),
                x = nodeBounds.x + nodeBounds.width/2 - cardWidth/2 - viewport.x,
                y = nodeBounds.y + nodeBounds.height - viewport.y;
            x = Math.max(0, Math.min(x, viewport.width - cardWidth));
            y = Math.max(0, Math.min(y, viewport.height - cardHeight));
            x += diagramOffset.left - parentOffset.left;
            y += diagramOffset.top - parentOffset.top;

            $card.css('left', '' + x + 'px');
            $card.css('top', '' + y + 'px');
            $card.show();
        };

        Explorer.prototype.setData = function(part, field, refPart, include, apply) {
            let self = this;
            let partId = part.getId(), refId = refPart ? refPart.getId() : null;

            let wasShown = self.isShown(part);
            if(include) {
                if(Misc.hasIndex(self.data, partId, field, refId)) return;
                Misc.setIndex(self.data, partId, field, refId, true);
            } else {
                if(!Misc.hasIndex(self.data, partId, field, refId)) return;
                Misc.deleteIndex(self.data, partId, field, refId);
            }
            let isShown = self.isShown(part);

            if(field === 'secondary') {
                let inLink = part.getLink(Concept.in, self.getNode()),
                    isSecondary = Misc.hasIndex(self.data, part.getId(), 'secondary');
                if(inLink) self.setData(inLink, 'hidden', part, isSecondary);
            }

            if(part.isLink()) {
                self.checkLink(part);
            }

            if(wasShown !== isShown) {
                part.eachLink(function(link, direction, neighbor) {
                    self.checkLink(link);
                });
            }

            if(apply) self.updateShown();
        };

        Explorer.prototype.checkLink = function(link, apply) {
            let self = this, node = self.getNode();

            if(link.deleted) {
                link.eachNeighbor(function(neighbor) {
                    let nid = neighbor.getId();
                    if(self.data[nid]) for(let field in self.data[nid]) {
                        if(self.data[nid][field] && self.data[nid][field][link.getId()])
                            self.setData(neighbor, field, link, false);
                    }
                });
                Misc.deleteIndex(self.data, link.getId());
                if(apply) self.updateShown();
                return;
            }

            let start = link.getStart(), end = link.getEnd();
            let isPrimary = false, isSecondary = false, isMeta = false, isExternal = false, isDangling = false;

            if(start) {
                if(end === node) isPrimary = true;
                else if(start.hasLink(Concept.in, node)) {
                    if(end) {
                        if(end.hasLink(Concept.in, node)) isSecondary = true;
                        else if(end.hasLink(Concept.metaOf, node)) isMeta = true;
                        else isExternal = true;
                    } else isDangling = true;
                }
            } else isDangling = true;

            if(isPrimary || isSecondary) {
                let hidden = self.isHidden(link) || self.isHidden(end);
                self.setData(start, 'shown', link, !hidden);
            }

            if(self.getMode() === 'graph') {
                if(isSecondary) {
                    self.setData(start, 'secondary', link, true);
                }

                if(isExternal) {
                    let shown = self.isShown(link);
                    self.setData(end, 'shown', link, shown);
                    if(link.getConcept() === Concept.isA) self.setData(start, 'isA', end, !shown);
                }

                if((!start || self.isShown(start)) && (!end || self.isShown(end)) && !isExternal) {
                    self.setData(link, 'shown', link, true);
                }
            }

            if(apply) self.updateShown();
        };

        Explorer.prototype.isShown = function(part) {
            let self = this;
            return Misc.hasIndex(self.data, part.getId(), 'shown') && !Misc.hasIndex(self.data, part.getId(), 'hidden');
        };

        Explorer.prototype.isHidden = function(part) {
            let self = this;
            return Misc.hasIndex(self.data, part.getId(), 'hidden');
        };

        Explorer.prototype.updateShown = function() {
            let self = this, diagram = self.getActiveDiagram();
            for(let id in self.data) {

                let part = Part.get(id);
                if(!part) continue;
                if(self.getMode() === 'palette' && part === self.getNode()) continue;

                part.updateGoData(diagram, self.isShown(part));
                let isA = {};
                if(self.data[id].isA) {
                    for(let refId in self.data[id].isA) {
                        isA[refId] = Part.get(refId);
                    }
                }
                part.setGoData(diagram, 'isA', isA);
            }
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
            //diagram.clear();
            let nodes = diagram.nodes;
            while(nodes.next()) {
                let node = nodes.value;
                diagram.model.removeNodeData(node.data);
            }
            let links = diagram.links;
            while(links.next()) {
                let link = links.value;
                diagram.model.removeLinkData(link.data);
            }
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


        function g(p, e) { return Part.get(p).getGoPart(Page.getActiveDiagram(e)); }
        function gd(p, e, k) { return Part.get(p).getGoData(Page.explorers[e].getActiveDiagram(), k); }
        function sgd(p, e, k, v) { Part.get(p).setGoData(Page.explorers[e].getActiveDiagram(), k, v); }



