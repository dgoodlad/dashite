(function(undefined) {
  function getGraphSources() {
    var graphSources = [];
    d3.selectAll(".graph").each(function() {
      graphSources.push(d3.select(this).attr("data-src"));
    });
    return graphSources;
  }

  function renderError(err, source) {
    console.error("Error retrieving " + source + ": " + err);
  }

  /* Graphite structures points as [value, timestamp] */
  function xVal(point) { return new Date(1000 * point[1]) }
  function yVal(point) { return point[0] }

  var bisectDate = d3.bisector(function(d) { return xVal(d); }).left;

  function renderGraph(el, json) {
    var colors = d3.scale.category10();

    var h = 600;
    var w = 700;
    var padding = 80;

    var xScale = d3.time.scale()
      .range([padding, w - padding])
      .domain([
        d3.min(json, function(d) { return d3.min(d.datapoints, xVal) }),
        d3.max(json, function(d) { return d3.max(d.datapoints, xVal) })
      ]);

    var yScale = d3.scale.linear()
      .range([h - padding, 0])
      .domain([
        d3.min(json, function(d) { return d3.min(d.datapoints, yVal) }),
        d3.max(json, function(d) { return d3.max(d.datapoints, yVal) }),
      ]);

    var xAxis = d3.svg.axis()
      .scale(xScale)
      .orient("bottom");

    var yAxis = d3.svg.axis()
      .scale(yScale)
      .orient("left");

    var line = d3.svg.line()
      .interpolate("basis")
      .x(function(d) { return xScale(xVal(d)); })
      .y(function(d) { return yScale(yVal(d)); })
      .interpolate("monotone")
      .defined(function(d) { return !isNaN(yVal(d)); });

    var svg = d3.select(el)
                .append("svg")
                .attr("height", h)
                .attr("width", w);

    var legend = d3.select(el)
                   .append("ul")
                   .classed("legend", true)
                   .select("li")
                   .data(json)
                   .enter()
                     .append("li")
                     .text(function(d) { return d.target; })
                     .style("color", function(d, index) { return colors(index); });

    svg.selectAll("path.line")
       .data(json)
       .enter().append("path")
         .classed("line", true)
         .attr("stroke", function(d, index) {
           return colors(index);
         })
         .attr("d", function(dataset) {
           return line(dataset.datapoints);
         });

    svg.append("g")
      .classed("x-axis", true)
      .attr("transform", "translate(0, " + (h - padding) + ")")
      .call(xAxis);

    svg.append("g")
      .classed("y-axis", true)
      .attr("transform", "translate(" + padding + ", 0)")
      .call(yAxis);

    var focus = svg.append("g")
      .attr("class", "focus")
      .style("display", "none");

    focus.append("line")
      .attr("x1", 0)
      .attr("x2", 0)
      .attr("y1", 0)
      .attr("y2", h - padding);

    svg.append("rect")
      .attr("class", "overlay")
      .attr("x", padding)
      .attr("y", 0)
      .attr("width", w - 2 * padding)
      .attr("height", h - padding)
      .on("mouseover", function() { focus.style("display", null); })
      .on("mouseout",  function() { focus.style("display", "none"); })
      .on("mousemove", function() {
        /* TODO validate the assumption that the first series in the json will
         * have x values for the whole shebang */
        var x0 = xScale.invert(d3.mouse(this)[0]),
            i = bisectDate(json[0].datapoints, x0, 1),
            d0 = json[0].datapoints[i - 1],
            d1 = json[0].datapoints[i];
        if(d0 && d1) {
          var d = x0 - xVal(d0) > xVal(d1) - x0 ? d1 : d0;
        } else if(d0) {
          var d = d0;
        } else if(d1) {
          var d = d1;
        } else {
          console.log("Failed to get datapoint for highlight");
        }
        focus.attr("transform", "translate(" + xScale(xVal(d)) + ",0)");
      });
  }

  getGraphSources().forEach(function(source) {
    d3.json(source, function(err, json) {
      if(err && !json) {
        renderError(err, source);
      } else {
        renderGraph("body", json);
      }
    });
  });
})();
