        Relation.prototype.initDiagram = function() {
            let self = this;
            self.diagram = $$(go.Diagram, "graph-canvas",  // must name or refer to the DIV HTML element
            {
              grid: $$(go.Panel, "Grid",
                      $$(go.Shape, "LineH", { stroke: "lightgray", strokeWidth: 0.5 }),
                      $$(go.Shape, "LineH", { stroke: "gray", strokeWidth: 0.5, interval: 10 }),
                      $$(go.Shape, "LineV", { stroke: "lightgray", strokeWidth: 0.5 }),
                      $$(go.Shape, "LineV", { stroke: "gray", strokeWidth: 0.5, interval: 10 })
                    ),
              allowDrop: true,  // must be true to accept drops from the Palette
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
              "ChangedSelection": onSelectionChanged
            });

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

            // when the document is modified, add a "*" to the title and enable the "Save" button
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

            function makePort(name, spot, output, input, fromMax, toMax) {
                // the port is basically just a small transparent square
                var options =
                {
                    fill: null,  // not seen, by default; set to a translucent gray by showSmallPorts, defined below
                    stroke: null,
                    desiredSize: new go.Size(7, 7),
                    alignment: spot,  // align the port on the main Shape
                    alignmentFocus: spot,  // just inside the Shape
                    portId: name,  // declare this object to be a "port"
                    fromSpot: spot, toSpot: spot,  // declare where links may connect at this port
                    fromLinkable: output, toLinkable: input,  // declare whether the user may draw links to/from here
                    cursor: "pointer"  // show a different cursor to indicate potential link point
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

            // To simplify this code we define a function for creating a context menu button:
            function makeButton(text, action, visiblePredicate) {
              return $$("ContextMenuButton",
                       $$(go.TextBlock, text),
                       { click: action },
                       // don't bother with binding GraphObject.visible if there's no predicate
                       visiblePredicate ? new go.Binding("visible", "", function(o, e) { return o.diagram ? visiblePredicate(o, e) : false; }).ofObject() : {});
            }

            // a context menu is an Adornment with a bunch of buttons in them
            var partContextMenu =
              $$(go.Adornment, "Vertical",
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
                                if(currentConcept.node == node.id) {
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
                                            node: node.id,
                                        }
                                    });
                                }
                            },
                            function(o) {
                                let part = o.part.adornedPart;
                                return part.diagram === self.diagram;
                            }),
                    makeButton("Edit Concept",
                            function(e, obj) {
                                let part = obj.part.adornedPart;
                                if(!(part instanceof go.Node)) return;
                                self.editEntry('concept', part.data.concept);
                            },
                            function(o) {
                                return true;
                            }),
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
                        } else if(data.concept && self.concepts.hasOwnProperty(data.concept)) {
                            text = self.concepts[data.concept].name;
                        }
                        text += ' [' + data.id + ']';
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
            if(!nodeData.hasOwnProperty('loc') && nodeData.head && self.nodes.hasOwnProperty(nodeData.head)) {
                let head = self.diagram.model.findNodeDataForKey(nodeData.head), headLoc = head.loc.split(' '), refLoc = null;
                if(nodeData.reference) {
                    let reference = self.diagram.model.findNodeDataForKey(nodeData.reference);
                    let refLoc = reference.loc.split(' ');
                }
                if(!refLoc) refLoc = headLoc;
                let x = (parseFloat(headLoc[0]) + parseFloat(refLoc[0])) / 2,
                    y = Math.max(parseFloat(headLoc[1]), parseFloat(refLoc[1])) + 75;
                nodeData.loc = '' + x + ' ' + y;
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
