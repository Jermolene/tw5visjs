/*\
title: $:/plugins/emkay/visjs/graphwidget.js
type: application/javascript
module-type: widget

  A widget for displaying graphs using Vis.js.  http://visjs.org

  For full help see $:/plugins/emkay/visjs/help

\*/

/*jslint node: true, browser: true */
/*global $tw: false */

(function() {
  'use strict';

  var Widget = require("$:/core/modules/widgets/widget.js").widget;
  var moment = require("$:/plugins/emkay/visjs/moment.js").moment;
  var vis = require("$:/plugins/emkay/visjs/vis.js").vis;

  var compiledFilters = {
    "backlink": $tw.wiki.compileFilter("[is[current]backlinks[]]"),
    "link": $tw.wiki.compileFilter("[is[current]links[]]"),
    "list": $tw.wiki.compileFilter("[list[]]"),
    "listed": $tw.wiki.compileFilter("[is[current]listed[]]"),
    "tag": $tw.wiki.compileFilter("[is[current]tags[]]"),
    "tagging": $tw.wiki.compileFilter("[is[current]tagging[]]")
  };

  var GraphWidget = function(parseTreeNode,options) {
    this.initialise(parseTreeNode,options);
  };

  GraphWidget.prototype = new Widget();

  GraphWidget.prototype.render = function(parent,nextSibling) {
    this.parentDomNode = parent;
    this.computeAttributes();
    var dm = $tw.utils.domMaker;
    this.errorDiv = dm("div",{document: this.document, "class": "widget-error"});
    parent.insertBefore(this.errorDiv,nextSibling);
    this.domNodes.push(this.errorDiv);

    var attrParseWorked = this.execute();
    if (attrParseWorked === undefined) {
      var graphHolder = this.document.createElement("div");
      parent.insertBefore(graphHolder,nextSibling);
      this.domNodes.push(graphHolder);
      this.createGraph(graphHolder);
    } else {
      this.errorDiv.innerHTML = this.parseTreeNode.type+": Unexpected attribute(s) "+attrParseWorked.join(", ");
      this.refresh = function() {}; // disable refresh of this as it won't work with incorrrect attributes
    }
  };

  GraphWidget.prototype.parseWidgetAttributes = function(attributeDefns) {
    var errors = [];
    for (var attr in this.attributes) {
      if (attributeDefns[attr] === undefined) {
        errors.push(attr);
      } else {
        if (attributeDefns[attr].type == "string") {
          this[attr] = this.attributes[attr];
        } else if (attributeDefns[attr].type == "integer") {
          this[attr] = parseInt(this.attributes[attr] );
          if (isNaN(this[attr])) {
            delete this[attr];
          }
        }
      }
    }
    if (errors.length !== 0) {
      return errors;
    }
    for (var attrDefn in attributeDefns) {
      if (this[attrDefn] === undefined) {
        this[attrDefn] = attributeDefns[attrDefn].defaultValue;
      }
    }
    return undefined;
  };

  GraphWidget.prototype.execute = function() {
    var attrParseWorked = this.parseWidgetAttributes({
           tiddler:       {   type: "string", defaultValue: this.getVariable("currentTiddler")},
           maxDepth:       {   type: "integer", defaultValue: 3}
           // options:  { type: "flags", defaultValue: undefined}
            });
    return attrParseWorked;
  };

  function addNode(nodeSet, tiddlerTitle, startingNode) {
    nodeSet[tiddlerTitle] = {id: tiddlerTitle, label: tiddlerTitle, shape: "elipse"};
    var tiddler = $tw.wiki.getTiddler(tiddlerTitle);
    if ($tw.wiki.isSystemTiddler(tiddlerTitle)) {
      // System Tiddler
      nodeSet[tiddlerTitle].shape = "box";
      nodeSet[tiddlerTitle].color = "Gainsboro";
    } else if (tiddler === undefined) {
      // Missing Tiddler
      nodeSet[tiddlerTitle].shape = "triangle";
    } else {
      // Normal Tiddler
      if (tiddler.fields.color) {
        nodeSet[tiddlerTitle].color = tiddler.fields.color;
      }
      if (startingNode) {
        nodeSet[tiddlerTitle].shape = "circle";
      if (!tiddler.fields.color) {
        nodeSet[tiddlerTitle].color = "DodgerBlue";
      }
      }
    }
  }

  function addEdge(edgeSet, throughLinkType, fromTiddlerTitle, toTiddlerTitle) {
    if (fromTiddlerTitle !== null) {
      var linkType = throughLinkType;
      var tmp;
      if (throughLinkType == "backlink") {
        linkType = "link";
        fromTiddlerTitle = [toTiddlerTitle, toTiddlerTitle = fromTiddlerTitle][0];
      } else if (throughLinkType == "listed") {
        linkType = "list";
        fromTiddlerTitle = [toTiddlerTitle, toTiddlerTitle = fromTiddlerTitle][0];
      } else if (throughLinkType == "tagging") {
        linkType = "tag";
        fromTiddlerTitle = [toTiddlerTitle, toTiddlerTitle = fromTiddlerTitle][0];
      }
      var lineStyle = "arrow";
      var width = 1;

      if (linkType == "link") {
        width = 2;
      }
      if (linkType == "tag") {
        lineStyle = "arrow-center";
      }
      edgeSet[fromTiddlerTitle+":"+toTiddlerTitle+":"+linkType] = {from: fromTiddlerTitle, to: toTiddlerTitle,
        // label: linkType,
        style: lineStyle, width: width};
    }
  }

    // http://visjs.org/examples/graph/04_shapes.html
  //
  // Encoding:
  // normal tiddlers
  // missing tiddlers
  // tags
  // system tiddlers
  // Shadow tiddlers
  //
  function addNodesAndEdges(linkType, currTiddlerTitle, nodeAndEdgeSets, depth, maxDepth) {
    var tiddlers = compiledFilters[linkType].call(null, null, currTiddlerTitle);
    tiddlers.forEach(function(entry) {
        nodeAndEdgeSets = buildNodeAndEdgeSets(nodeAndEdgeSets, currTiddlerTitle, linkType, entry, depth+1, maxDepth);
    });
  }

  function buildNodeAndEdgeSets(nodeAndEdgeSets, fromTiddlerTitle, linkType, toTiddlerTitle, depth, maxDepth) {
    if (depth > maxDepth) {
      return nodeAndEdgeSets;
    }
    if (nodeAndEdgeSets.edgeSet.hasOwnProperty(fromTiddlerTitle+":"+toTiddlerTitle+":"+linkType)) {
      return nodeAndEdgeSets;
    }
    addEdge(nodeAndEdgeSets.edgeSet, linkType, fromTiddlerTitle, toTiddlerTitle);

    if (!nodeAndEdgeSets.nodeSet.hasOwnProperty(toTiddlerTitle)) {
      addNode(nodeAndEdgeSets.nodeSet, toTiddlerTitle,fromTiddlerTitle === null);

      // Forward links
      addNodesAndEdges("link", toTiddlerTitle, nodeAndEdgeSets, depth, maxDepth);
      // Forward links though list
      addNodesAndEdges("list", toTiddlerTitle, nodeAndEdgeSets, depth, maxDepth);
      // Forward links though tag
      addNodesAndEdges("tag", toTiddlerTitle, nodeAndEdgeSets, depth, maxDepth);
      // Backlinks
      addNodesAndEdges("backlink", toTiddlerTitle, nodeAndEdgeSets, depth, maxDepth);
      // Backlinks though listed
      addNodesAndEdges("listed", toTiddlerTitle, nodeAndEdgeSets, depth, maxDepth);
      // Backlinks though tags
      addNodesAndEdges("tagging", toTiddlerTitle, nodeAndEdgeSets, depth, maxDepth);
    }
    return nodeAndEdgeSets;
  }

  function displayTiddler(self,toTiddlerTitle,fromTiddlerTitle){
    var bounds = self.domNodes[0].getBoundingClientRect();
    var e = {
      type: "tw-navigate",
      navigateTo: toTiddlerTitle,
      navigateFromTitle: fromTiddlerTitle,
      navigateFromClientRect: { top: bounds.top, left: bounds.left, width: bounds.width, right: bounds.right, bottom: bounds.bottom, height: bounds.height
      }
    };
    self.dispatchEvent(e);
  }

  GraphWidget.prototype.createGraph = function(holderDiv) {

    var data= {
      nodes: [],
      edges: []
    };
    var options = {};
    // this.document === $tw.fakeDocument for test mode
    if (this.parentWidget.parentWidget.mockGraph === undefined) {
      this.graph = new vis.Graph(holderDiv, data, options);
    } else {
      this.graph = this.parentWidget.parentWidget.mockGraph;
    }
    var self = this;
    var nodeAndEdgeSets = buildNodeAndEdgeSets({nodeSet: {}, edgeSet: {}},null, null, this.tiddler,1,this.maxDepth);

    var nodes = [];
    for (var key in nodeAndEdgeSets.nodeSet) {
      if (nodeAndEdgeSets.nodeSet.hasOwnProperty(key)) {
        nodes.push(nodeAndEdgeSets.nodeSet[key]);
      }
    }

    var edges = [];
    for (key in nodeAndEdgeSets.edgeSet) {
      if (nodeAndEdgeSets.edgeSet.hasOwnProperty(key)) {
        edges.push(nodeAndEdgeSets.edgeSet[key]);
      }
    }

    data= {
      nodes: nodes,
      edges: edges
    };
    this.graph.setData(data);
    this.graph.on('click', function(properties) {
      // Check if node is selected
      console.log("doubleClick");
      if (properties.nodes.length !== 0) {
        var toTiddlerTitle = properties.nodes[0];
        var fromTiddlerTitle = self.getVariable("currentTiddler");
        displayTiddler(self, toTiddlerTitle, fromTiddlerTitle);
      }
    });
    this.graph.on('doubleClick', function(properties) {
      // Check if node is selected
      console.log("click");
      if (properties.nodes.length !== 0) {
        self.tiddler = properties.nodes[0];
        self.createGraph(holderDiv);
      }
    });
    // this.graph.on('select', function(properties) {
    //   console.log("select");
    //   // Check if node is selected
    //   if (properties.nodes.length !== 0) {
    //     var toTiddlerTitle = properties.nodes[0];
    //     var fromTiddlerTitle = self.getVariable("currentTiddler");
    //     displayTiddler(self, toTiddlerTitle, fromTiddlerTitle);
    //   }
    // });
  };


  exports.visjsgraph = GraphWidget;

  }
  ());
