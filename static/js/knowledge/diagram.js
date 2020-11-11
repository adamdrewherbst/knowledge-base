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

            self.$wrapper = Page.addListItem($('#concept-explorers'), function($explorer) {
                $explorer.attr('id', 'concept-explorer-' + this.id);
            });

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
            self.$wrapper.find('.toggle-links').click(function(e) {
                if(!self.node) return;
                let $this = $(this), show = $this.hasClass('show-links');
                $this.toggleClass('show-links', !show);
                $this.toggleClass('hide-links', show);
                $this.text(show ? 'Hide' : 'Show');

                if($this.hasClass('links-external')) type = 'external';
                else if($this.hasClass('links-meta')) type = 'meta';

                if(show) self.shownLinkTypes[type] = true;
                else delete self.shownLinkTypes[type];
                self.checkAllLinks();
                self.updateShown();
            });
            self.$wrapper.find('.concept-evaluate-button').click(function(e) {
                if(self.node) {
                    self.node.evaluate(100);
                }
            });
            self.$wrapper.find('.apply-map-button').click(function(e) {
                let id = self.$wrapper.find('.show-map-select').val();
                if(id in Map.map) {
                    Map.map[id].apply();
                    Page.updateExplorers();
                }
            });

            for(let id in Map.map) self.addMapOption(id);
            self.$wrapper.find('.show-map-select').change(function(e) {
                let id = $(this).val();
                if(!isNaN(id)) id = parseInt(id);
                Page.displayMap(id in Map.map ? Map.map[id] : null);
            });

            self.$showLinks = self.$wrapper.find('.explorer-show-links');
            self.$showLinksId = self.$showLinks.find('.explorer-show-links-id');
            self.$showInternal = self.$showLinks.find('.explorer-show-internal');
            self.$showExternal = self.$showLinks.find('.explorer-show-external');
            self.$showMeta = self.$showLinks.find('.explorer-show-meta');
            self.$showLinks.find('input[type="radio"]').change(function(e) {
                let val = self.$showLinks.find('input[name="show-hide-all"]:checked').val();
                if(val === undefined) return;
                let show = val === 'show' ? true : false;
                self.$showLinks.find('input[type="checkbox"]').prop('checked', show).trigger('change');
            });

            self.partEditing = null;
            self.$partEdit = self.$wrapper.find('.explorer-edit-concept');

            self.$partEdit.find('.explorer-custom-concept-panel').attr('id', 'explorer-custom-concept-panel-' + self.id);
            self.$partEdit.find('.explorer-select-concept-panel').attr('id', 'explorer-select-concept-panel-' + self.id);
            self.$partEdit.find('.explorer-custom-concept-tab').attr('href', '#explorer-custom-concept-panel-' + self.id);
            self.$partEdit.find('.explorer-select-concept-tab').attr('href', '#explorer-select-concept-panel-' + self.id);

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

            self.shownLinkTypes = {'primary': true, 'secondary': true};

            self.setMode('graph');

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
            self.setData(self.node, 'shown', self.node, true);
            self.updateShown();
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

        Explorer.prototype.addMapOption = function(id) {
            this.$wrapper.find('.show-map-select').append('<option value="' + id + '">' + id + '</option>');
        };

        Explorer.prototype.removeMapOption = function(id) {
            this.$wrapper.find('.show-map-select > option[value="' + id + '"]').remove();
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
                "draggingTool.dragsLink": false,
                "draggingTool.isGridSnapEnabled": false,
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
                    graph.model.setKeyForLinkData(e.subject.data, link.getId());
                    graph.model.setLabelKeysForLinkData(e.subject.data, [link.getGoNodeId()]);
                    graph.model.addNodeData({
                        id: link.getGoNodeId(),
                        category: 'LinkLabel'
                    });
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
                        if(data.mappedId) return '#c39'
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
                        let mapping = data.mappedId ? (' > ' + data.mappedId) : '';
                        return (name || '...') + ' [' + data.id + ']' + mapping;
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

            // This is the template for a label node on a link: just an Ellipse.
            // This node supports user-drawn links to and from the label node.
            graph.nodeTemplateMap.add("LinkLabel", $$("Node",
                {
                    selectable: false, avoidable: false,
                    layerName: "Foreground"
                },  // always have link label nodes in front of Links
                $$(go.Shape, "Ellipse", {
                    fill: 'rgba(255,255,255,0)', width: 60, height: 40, stroke: null,
                    portId: "", fromLinkable: true, toLinkable: true, cursor: "pointer"
                })
            ));

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
                            new go.Binding("text", "", function(data, link) {
                                let mapping = data.mappedId ? ' > ' + data.mappedId : '';
                                return (data.name || '...') + ' [' + data.id + ']' + mapping;
                            })
                        )
                    ),
                    {
                        relinkableFrom: true,
                        relinkableTo: true,
                        contextMenu: partContextMenu
                    }
                );

            graph.model = $$(go.GraphLinksModel,
            {
                nodeKeyProperty: 'id',
                linkKeyProperty: 'id',
                linkLabelKeysProperty: 'labelKeys',
                linkFromPortIdProperty: 'fromPort',
                linkToPortIdProperty: 'toPort'
            });
            //graph.toolManager.linkingTool.archetypeLabelNodeData = { category: "LinkLabel" };

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
                    let it = e.subject.iterator, added = false;
                    console.log('dropped nodes');
                    while(it.next()) {
                        let node = it.value;
                        if(!(node instanceof go.Node)) continue;
                        console.log(node.data);
                        let otherPart = Part.get(node);
                        if(otherPart) {
                            self.partEditing.addLink(Concept.isA, otherPart);
                            added = true;
                        }
                        if(added) self.partEditing.updatePage();;
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
                        if(part) {
                            part.delete();
                            part.updatePage();
                        }
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
            part.each(['>', Concept.isA, '*'], function(node) {
                node.updateGoData(self.instanceOfPalette, true);
            });
            if(part.isLink()) {
                let checked = {}, $results = self.$partEdit.find('.explorer-select-concept-results');
                Page.clearList($results);
                self.addConceptResult($results, Concept.in);
                self.addConceptResult($results, Concept.isA);
                part.eachEndpoint(function(endpoint, direction, other) {
                    endpoint.eachIsA(function(node) {
                        node.eachLink(function(link, dir, neighbor) {
                            if(dir === direction) return;
                            let concept = link.getConcept();
                            if(!concept || concept === Concept.isA || concept === Concept.in || concept === Concept.of) return;
                            if(checked[concept.getId()]) return;
                            checked[concept.getId()] = true;
                            if(!neighbor || other.hasLink(Concept.isA, neighbor, true)) {
                                self.addConceptResult($results, concept);
                            }
                        });
                    }, true);
                });
            }
            self.$partEdit.find('.explorer-custom-concept-tab').tab('show');
            self.$partEdit.find('.card-header').toggle(part.isLink());
            self.showCard(self.$partEdit, part);
        };

        Explorer.prototype.addConceptResult = function($results, concept) {
            let self = this;
            Page.addListItem($results, function($result) {
                $result.find('.explorer-select-concept-name').text(concept.getName());
                $result.find('.explorer-select-concept-description').text(concept.getDescription());
                $result.click(function(e) {
                    if(self.partEditing && self.partEditing.isLink()) {
                        self.partEditing.setConcept(concept);
                        self.partEditing.updatePage();
                        self.$partEdit.hide();
                    }
                });
            });
        };

        Explorer.prototype.showLinks = function(part) {
            let self = this, $showList = self.$showLinks.find('.explorer-show-hide-individual');
            $showList.children().first().nextAll().remove();
            part.eachLink(function(link, direction, neighbor) {
                let type = self.getLinkType(link),
                    showable = (type === 'primary' || type === 'secondary') && direction === 'incoming'
                        && !self.hasData(link, 'hidden', neighbor);
                showable = showable || type === 'external';
                if(showable) {
                    Page.addListItem($showList, function($checkbox) {
                        $checkbox.val(link.getId());
                        $checkbox.find('label').html(link.displayString());
                        $checkbox.find('input').prop('checked', self.isShown(link)).change(function(e) {
                            let show = $(this).prop('checked');
                            self.setData(link, 'shown', link, show);
                            self.setData(link, 'hidden', link, !show);
                            self.updateShown();
                        });
                    });
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

        Explorer.prototype.hasData = function(part, field, refPart) {
            let id = part.getId(), refId = refPart ? refPart.getId() : null;
            return Misc.hasIndex(this.data, id, field, refId);
        };

        Explorer.prototype.setData = function(part, field, refPart, include, apply) {
            let self = this;
            if(!part || !refPart) return;
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

            //console.log((include ? '' : 'un') + 'set ' + part.toString() + ' ' + field + ' by ' + refPart.toString());

            if(field === 'secondary') {
                let inLink = part.getLink(Concept.in, self.getNode()),
                    isSecondary = Misc.hasIndex(self.data, part.getId(), 'secondary');
                if(inLink) self.setData(inLink, 'hidden', part, isSecondary);
            }

            if(part.isLink()) {
                self.checkLink(part);
            }

            //if(wasShown !== isShown) {
                part.eachLink(function(link, direction, neighbor) {
                    self.checkLink(link);
                });
            //}

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
                return;
            }

            let start = link.getStart(), end = link.getEnd(), type = self.getLinkType(link);
            let isMeta = type.startsWith('meta-'), mainType = isMeta ? type.substring(5) : type;
            let proximal = mainType === 'external' ? start : end, distal = proximal === start ? end : start;

            if(self.getMode() === 'graph') {
                let typeShown = mainType in self.shownLinkTypes;
                if(isMeta) typeShown = typeShown && mainType !== 'secondary' && 'meta' in self.shownLinkTypes;
                let linkHidden = self.hasData(link, 'hidden', link) || (proximal && self.isHidden(proximal));

                if(distal) {
                    self.setData(distal, 'shown', link, typeShown && !linkHidden);
                    self.setData(distal, 'hidden', link, (mainType === 'primary' || type === 'secondary') && linkHidden);
                    self.setData(distal, 'secondary', link, mainType === 'secondary' && !linkHidden);
                    self.setData(link, 'hidden', distal, type === 'primary' && Misc.hasIndex(self.data, distal.getId(), 'secondary'));
                }
                self.setData(link, 'shown', link, (!start || self.isShown(start)) && (!end || self.isShown(end)));

                if(proximal && distal)
                    self.setData(proximal, 'isA', distal, mainType === 'external' && !self.isShown(link));
            } else if(self.getMode() === 'palette') {
                self.setData(distal, 'shown', link, mainType === 'primary');
            }
        };

        Explorer.prototype.checkAllLinks = function() {
            let self = this, links = {};
            self.node.each(['<','*','*'], function(part) {
                part.eachLink(function(link) {
                    links[link.getId()] = link;
                });
            });
            Misc.each(links, function(link) {
                self.checkLink(link);
            });
        };

        Explorer.prototype.getLinkType = function(link) {
            let self = this, start = link.getStart(), end = link.getEnd(), node = self.getNode();

            if(!start || !end) return 'dangling';
            if(end === node) return start.isMeta() ? 'meta-primary' : 'primary';
            let startType = start.getMainLinkType(), endType = end.getMainLinkType(),
                startPrimary = start.hasLink(startType, node), endPrimary = end.hasLink(endType, node);
            if(endPrimary && end.isMeta()) return 'meta-secondary';
            if(startPrimary) {
                if(endPrimary) return end.isMeta() ? 'meta-secondary' : 'secondary';
                else return start.isMeta() ? 'meta-external' : 'external';
            }
            return '';
        };

        Explorer.prototype.isShown = function(part) {
            let self = this, pid = part.getId();
            return Misc.hasIndex(self.data, pid, 'shown') && !Misc.hasIndex(self.data, pid, 'hidden');
        };

        Explorer.prototype.isHidden = function(part) {
            let self = this;
            return Misc.hasIndex(self.data, part.getId(), 'hidden');
        };

        Explorer.prototype.updateShown = function() {
            let self = this, diagram = self.getActiveDiagram();

            self.eachGoPart(function(goPart) {
                let part = Part.get(goPart);
                if(!part) return;
                //if(goPart.data && goPart.data.category === 'LinkLabel') return;
                if(!self.isShown(part)) part.updateGoData(diagram, false);
            });

            for(let id in self.data) {

                let part = Part.get(id);
                if(!part || !self.isShown(part)) continue;
                if(self.getMode() === 'palette' && part === self.getNode()) continue;

                part.updateGoData(diagram, true);
                let isA = {};
                if(self.data[id].isA) {
                    for(let refId in self.data[id].isA) {
                        isA[refId] = Part.get(refId);
                    }
                }
                part.setGoData(diagram, 'isA', isA);
            }
        };

        Explorer.prototype.eachGoData = function(callback) {
            let self = this, diagram = self.getActiveDiagram(), model = diagram.model;
            if(Array.isArray(model.nodeDataArray)) model.nodeDataArray.forEach(function(data) {
                callback.call(data, data);
            });
            if(Array.isArray(model.linkDataArray)) model.linkDataArray.forEach(function(data) {
                callback.call(data, data);
            });
        };

        Explorer.prototype.eachGoPart = function(callback) {
            let self = this, diagram = self.getActiveDiagram(), it = diagram.nodes;
            while(it.next()) {
                callback.call(it.value, it.value);
            }
            it = diagram.links;
            while(it.next()) {
                callback.call(it.value, it.value);
            }
        };

        Explorer.prototype.updatePartId = function(part) {
            let self = this, oldId = part.oldId, newId = part.getId();
            if(self.data.hasOwnProperty(oldId)) {
                self.data[newId] = self.data[oldId];
                delete self.data[oldId];
            }
            for(let id in self.data) {
                for(let field in self.data[id]) {
                    if(self.data[id][field].hasOwnProperty(oldId)) {
                        self.data[id][field][newId] = self.data[id][field][oldId];
                        delete self.data[id][field][oldId];
                    }
                }
            }
        };


        Page.clearList = function($list) {
            $list.children().first().nextAll().remove();
        };

        Page.addListItem = function($list, preprocess) {
            let $item = $list.children('.list-template').first().clone().removeClass('list-template');
            if(typeof preprocess === 'function') preprocess.call($item, $item);
            $item.appendTo($list);
            return $item;
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



