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
                This is the template we use for all nodes in the diagram.
            */
            self.diagram.nodeTemplate = $$(go.Node, "Spot",
                {
                    locationSpot: go.Spot.Center,
                    toolTip:
                      $$(go.Adornment, "Auto",
                        $$(go.Shape, { fill: "#EFEFCC" }),
                        $$(go.TextBlock, { margin: 4, width: 140 },
                          new go.Binding("text", "", infoString).ofObject())
                      )
                },
                new go.Binding("location", "loc", go.Point.parse).makeTwoWay(go.Point.stringify),
                new go.Binding("visible", "visible"),
                new go.Binding("angle").makeTwoWay(),
                // the main object is a Panel that surrounds a TextBlock with a Shape
                $$(go.Panel, "Auto",
                  { name: "PANEL" },
                  new go.Binding("desiredSize", "size", go.Size.parse).makeTwoWay(go.Size.stringify),
                  $$(go.Shape, self.nodeTemplates['default'].shape,  // default figure
                    {
                      cursor: "pointer",
                      fill: self.nodeTemplates['default'].fill,  // default color
                      strokeWidth: 2
                    },
                    new go.Binding("figure"),
                    new go.Binding("fill")),
                  $$(go.TextBlock,
                    {
                      font: "bold 11pt Helvetica, Arial, sans-serif",
                      margin: 8,
                      maxSize: new go.Size(160, NaN),
                      wrap: go.TextBlock.WrapFit,
                      editable: true
                    },
                    new go.Binding("text", "", function(data, node) {
                        if(node.diagram === self.palette) return self.concepts[data.concept].name;
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
                //port on top for head/reference, port on bottom for properties/referrers
                makePort("T", go.Spot.Top, true, true, 1, 1),
                makePort("B", go.Spot.Bottom, true, true),
                { // handle mouse enter/leave events to show/hide the ports
                    mouseEnter: function(e, node) { showSmallPorts(node, true); },
                    mouseLeave: function(e, node) { showSmallPorts(node, false); },
                    contextMenu: partContextMenu
                }
            );

            self.diagram.linkTemplate =
                $$(go.Link,
                  $$(go.Shape,
                    new go.Binding("stroke", "color"),
                    new go.Binding("strokeWidth", "width"),
                    new go.Binding("strokeDashArray", "", function(data, link) {
                        console.log('calculating dash');
                        console.log(data);
                        console.log(link);
                        if(data.fromPort === 'T') return [4, 4];
                        else return null;
                    })
                ));

            // initialize the Palette that is on the left side of the page
            self.palette = $$(go.Palette, "concept-palette",  // must name or refer to the DIV HTML element
            {
                maxSelectionCount: 1,
                nodeTemplateMap: self.diagram.nodeTemplateMap,  // share the templates used by the diagram
            });

            self.palette.layout.comparer = function(a, b) {
                let c1 = a.data.concept, c2 = b.data.concept;
                if(c1 && c2 && self.concepts.hasOwnProperty(c1) && self.concepts.hasOwnProperty(c2))
                    return self.concepts[c1].name.localeCompare(self.concepts[c2].name);
                return 0;
            };

            self.setPaletteModel();
            self.clearDiagram();

            let canvas = document.getElementById('visualization-canvas');
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            self.canvas = canvas.getContext('2d');
        };


        Relation.prototype.setPaletteModel = function() {
            let self = this, concepts = self.concepts;
            let dataArray = [];
            for(let id in concepts) {
                let concept = concepts[id];
                dataArray.push({
                    concept: concept.id,
                    framework: concept.framework,
                    visible: self.framework && (self.framework.id <= 0 || concept.framework == self.framework.id)
                });
            }
            self.palette.model = $$(go.GraphLinksModel, {
                nodeDataArray: dataArray,
                linkDataArray: []
            });
        };


        Relation.prototype.filterPalette = function(framework) {
            let self = this;

            if(framework === undefined) {
                if(self.framework) framework = self.framework.id;
                else return;
            }
            self.paletteFramework = framework;
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
            } else frameworks.push(framework);
            self.paletteFrameworks = frameworks;

            self.palette.nodes.each(function(node) {
                self.palette.model.set(node.data, 'visible', self.isVisibleInPalette(node.data.concept));
            });
        }


        Relation.prototype.isVisibleInPalette = function(conceptId) {
            let self = this, concept = self.concepts[conceptId];
            if(concept.law > 0) return concept.law == self.law.id;
            for(let i = 0; i < self.paletteFrameworks.length; i++)
                if(self.paletteFrameworks[i] == concept.framework)
                    return true;
            return false;
        };


        Relation.prototype.clearDiagram = function() {
            let self = this;
            self.diagram.model = $$(go.GraphLinksModel,
            {
                nodeKeyProperty: 'id',
                linkFromPortIdProperty: 'fromPort',
                linkToPortIdProperty: 'toPort',
            });
        };


        Relation.prototype.draw = function() {
            let self = this;
            self.diagram.removeParts(self.diagram.nodes);
            //start by arranging the nodes visually as a tree descending from the root,
            //then allow the force layout to adjust them
            //=> first we need to identify the children of each node
            let rootNodes = [];
            let nodeMeta = {'-1': {children: []}};
            self.law.nodes.forEach(function(node) {
                nodeMeta[node] = {children: []};
            });
            self.law.nodes.forEach(function(node) {
                if(node < 0) return;
                let head = self.nodes[node].head, root = !head;;
                nodeMeta[root ? -1 : head].children.push(node);
                if(root) nodeMeta[node].level = 0;
            });

            let horizontal = 100, vertical = 100;
            let getOffsets = function(node) {
                let nc = nodeMeta[node].children.length, width = horizontal;
                if(nc > 0) {
                    width = 0;
                    nodeMeta[node].children.forEach(function(child) {
                        nodeMeta[child].offset = width;
                        width += getOffsets(child);
                    });
                    nodeMeta[node].children.forEach(function(child) {
                        nodeMeta[child].offset -= width / 2 - horizontal / 2;
                    });
                }
                nodeMeta[node].width = width;
                return width;
            };
            getOffsets(-1);

            let drawNodes = function(node, x, y) {
                if(node >= 0) {
                    self.drawNode(node, {
                        loc: '' + x + ' ' + y,
                    });
                }
                nodeMeta[node].children.forEach(function(child) {
                    drawNodes(child, x + nodeMeta[child].offset, y + 100);
                });
            };
            drawNodes(-1, self.diagram.viewportBounds.width/2, 50);

            let drawLinks = function(node) {
                if(node >= 0) self.drawLinks(node);
                nodeMeta[node].children.forEach(function(child) {
                    drawLinks(child);
                });
            };
            drawLinks(-1);

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


        Relation.prototype.drawNode = function(nodeId, options) {

            let self = this, node = self.findEntry('node', nodeId);
            if(!node || node.drawn) return;

            if(!options) options = {};
            let template = {};
            if(options.template) {
                if(self.nodeTemplates.hasOwnProperty(options.template))
                    template = self.nodeTemplates[options.template];
            }
            let drawLinks = options.drawLinks ? true : false;
            delete options.template;
            delete options.drawLinks;

            let nodeData = Object.assign({}, node, options, template);
            nodeData.value = node.value.writeValue();
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

            self.diagram.model.addNodeData(nodeData);
            if(drawLinks) self.drawLinks(nodeId);
            node.drawn = true;
        };


        Relation.prototype.drawLinks = function(nodeId) {
            let self = this, node = self.nodes[nodeId];
            if(node.head) {
                self.diagram.model.addLinkData({from: node.head, to: node.id, fromPort: 'B', toPort: 'T'});
            }
            if(node.reference) {
                self.diagram.model.addLinkData({from: node.id, to: node.reference, fromPort: 'T', toPort: 'B'});
            }
        };


        Relation.prototype.setNodeTemplate = function(node, template) {
            let self = this;
            if(!self.nodeTemplates.hasOwnProperty(template)) return false;
            if(typeof node != 'object') {
                if(isNaN(node)) return false;
                node = self.diagram.model.findNodeDataForKey(node);
                if(!node) return false;
            }
            let nodeTemplate = self.nodeTemplates[template];
            for(let property in nodeTemplate) {
                self.diagram.model.setDataProperty(node, property, nodeTemplate[property]);
            }
        };


        Relation.prototype.setNodeData = function(nodeId, attr, value) {
            console.log('setting node ' + nodeId + ' ' + attr + ' to ' + value);
            let self = this, node = self.nodes[nodeId];
            if(node) node[attr] = value;
            let data = self.diagram.model.findNodeDataForKey(nodeId);
            if(data) self.diagram.model.set(data, attr, value);
        };


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
            if(self.nodeMap.hasOwnProperty(id)) {
                for(let p in self.nodeMap[id]) {
                    for(let m in self.nodeMap[id][p]) {
                        let map = self.map[m], law = self.laws[map.lawId];
                        let mapStr = '';
                        for(let n in map.idMap) if(self.nodes[n].law == law.id) mapStr += '' + n + ',';
                        mapStr = mapStr.substring(0, mapStr.length-1);
                        mappings += '' + p + ' [' + self.concepts[self.nodes[p].concept].name + ']' + "\n"
                            + '.  in ' + law.name + ' [' + law.id + ']' + "\n"
                            + '.  ' + mapStr + ' (map ' + m + ')' + "\n";
                    }
                }
            }
            if(mappings == '') mappings = 'none';
            else mappings = "\n" + mappings;

            msg = 'ID: ' + node.id + "\n"
                + 'Law: ' + lawStr + "\n"
                + 'Predicates: ' + predicates + "\n"
                + 'Values: ' + node.value.toString() + "\n"
                + 'Mappings: ' + mappings;
            return msg;
        };


        Relation.prototype.syncGraph = function() {
            let self = this, graphNodes = [];

            self.law.eachNode(function(node) {
                node.preprocess();
            });

            self.diagram.nodes.each(function(node) {
                let id = parseInt(node.data['id']);
                self.findOrCreateEntry('node', id);
                if(graphNodes.indexOf(id) < 0) graphNodes.push(id);
            });
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

            self.law.eachNode(function(node) {
                if(graphNodes.indexOf(node.id) < 0) node.remove();
            });
            self.law.nodes = graphNodes;

            self.law.eachNode(function(node) {
                node.postprocess();
            });
        };
