var $$ = go.GraphObject.make;

var myDiagram = $$(go.Diagram, "graph-canvas",  // must name or refer to the DIV HTML element
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
  "undoManager.isEnabled": true
});

// when the document is modified, add a "*" to the title and enable the "Save" button
myDiagram.addDiagramListener("Modified", function(e) {
  var button = document.getElementById("graph-save-button");
  if (button) button.disabled = !myDiagram.isModified;
  var idx = document.title.indexOf("*");
  if (myDiagram.isModified) {
    if (idx < 0) document.title += "*";
  } else {
    if (idx >= 0) document.title = document.title.substr(0, idx);
  }
});

myDiagram.nodeTemplate = $$(go.Node, "Spot",
    { locationSpot: go.Spot.Center },
    new go.Binding("location", "loc", go.Point.parse).makeTwoWay(go.Point.stringify),
    new go.Binding("angle").makeTwoWay(),
    // the main object is a Panel that surrounds a TextBlock with a Shape
    $$(go.Panel, "Auto",
      { name: "PANEL" },
      new go.Binding("desiredSize", "size", go.Size.parse).makeTwoWay(go.Size.stringify),
      $$(go.Shape, "Rectangle",  // default figure
        {
          cursor: "pointer",
          fill: "white",  // default color
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
        new go.Binding("text").makeTwoWay())
    ),
    //port on top for head/reference, port on bottom for properties/referrers
    makePort("T", go.Spot.Top, true, true, 1, 1),
    makePort("B", go.Spot.Bottom, true, true),
    { // handle mouse enter/leave events to show/hide the ports
      mouseEnter: function(e, node) { showSmallPorts(node, true); },
      mouseLeave: function(e, node) { showSmallPorts(node, false); }
    }
);

clearDiagram();

//concepts required by any framework
var CORE_CONCEPTS = $$(go.GraphLinksModel, {
    nodeDataArray: [
            {{
                concepts = db(db.concept.framework == None).select()
                for concept in concepts:
            }}
        { concept: {{=concept.id}}, text: "{{=concept.name}}", figure: "RoundedRectangle", fill: "#88AD5F" },
            {{
                pass
            }}
    ],
    linkDataArray: []
});

// initialize the Palette that is on the left side of the page
var myPalette = $$(go.Palette, "concept-palette",  // must name or refer to the DIV HTML element
{
    maxSelectionCount: 1,
    nodeTemplateMap: myDiagram.nodeTemplateMap,  // share the templates used by myDiagram
    model: CORE_CONCEPTS,
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

function clearDiagram() {
    myDiagram.model = $$(go.GraphLinksModel,
    {
       linkFromPortIdProperty: 'fromPort',
       linkToPortIdProperty: 'toPort',
    });
}

function useFramework(id) { useFrameworkOrLaw('framework', id); }
function useLaw(id) { useFrameworkOrLaw('law', id); }

function useFrameworkOrLaw(type, id) {
    var currentFramework = parseInt($('#current_framework').val()),
        currentLaw = parseInt($('#current_law').val());
    $.ajax({
        url: "{{=URL('default', 'useFrameworkOrLaw', extension='json')}}",
        type: 'get',
        dataType: 'json',
        data: {
            type: type,
            id: id,
            currentFramework: currentFramework,
            currentLaw: currentLaw,
        },
        success: function(data) {
            //if we received a new framework to use, clear the existing one from the palette
            //and populate it with the new concepts
            if(data.frameworks && data.frameworks.length > 0) {
                myPalette.model = CORE_CONCEPTS;
                data.frameworks.forEach(function(framework) {
                    framework.concepts.forEach(function(concept) {
                        myPalette.model.addNodeData({
                            concept: concept.id, text: concept.name, figure: "RoundedRectangle", fill: "#88AD5F"
                        })
                    });
                });
                if(data.frameworks[0].id) $('#current_framework').val(data.frameworks[0].id);
            }
            //if we received a new law to use, clear the existing one from the graph
            //and populate it with the new nodes
            if(data.law && data.law.nodes) {
                myDiagram.removeParts(myDiagram.nodes);
                data.law.nodes.forEach(function(node) {
                });
                if(data.law.id) $('#current_law').val(data.law.id);
            }
        },
        error: function() {
        }
    });
}

function saveLaw() {
    var id = $('#current_law').val();
    if(isNaN(id)) return;

    var nodes = [];
    myDiagram.nodes.forEach(function(node) {
        var data = {'id': node.data['key'], 'law': id, 'concept': node.data['concept'], 'head': null, 'reference': null};
        var head = node.findNodesInto('T'),
            reference = node.findNodesOutOf('T');
        if(head.count > 0) data['head'] = head.data['key'];
        if(reference.count > 0) data['reference'] = reference.data['key'];
    });

    $.ajax({
        url: "{{=URL('default', 'saveLaw', extension='json')}}",
        type: 'post',
        dataType: 'json',
        data: {
            id: id,
            nodes: nodes,
        },
        success: function(data) {
            $('#law-save-msg').val('Relation saved').show(3000);
        },
        error: function() {
        }
    });
}
