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

  function normalizeOptions(options, defaults) {
    var normalized = {};
    d3.map(defaults).forEach(function(option,defaultValue) {
      if (options[option] == undefined || options[option] == null) {
        normalized[option] = defaultValue;
      } else {
        normalized[option] = options[option];
      }
    });
    return normalized;
  }

  function renderGraph(el, json, options) {
    var normalizedOptions = normalizeOptions(options || {}, {
      w: 700,
      h: 600,
      marginLeft:   80,
      marginRight:  0,
      marginTop:    0,
      marginBottom: 80,
      colors: d3.scale.category10()
    });

    var colors = normalizedOptions.colors;

    var h = normalizedOptions.h;
    var w = normalizedOptions.w;
    var margin = {
      left:   normalizedOptions.marginLeft,
      right:  normalizedOptions.marginRight,
      top:    normalizedOptions.marginTop,
      bottom: normalizedOptions.marginBottom,
    }

    var xScale = d3.time.scale()
      .range([margin.left, w + margin.left]);

    var yScale = d3.scale.linear()
      // "Backwards" range to render increasing values from bottom up
      .range([h, 0]);

    xScale.domain([
        d3.min(json, function(d) { return d3.min(d.datapoints, xVal) }),
        d3.max(json, function(d) { return d3.max(d.datapoints, xVal) })
      ]);

    yScale
      .domain([
        d3.min(json, function(d) { return d3.min(d.datapoints, yVal) }),
        d3.max(json, function(d) { return d3.max(d.datapoints, yVal) }),
      ])
      .nice();

    var xAxis = d3.svg.axis()
      .scale(xScale)
      .orient("bottom");

    var yAxis = d3.svg.axis()
      .scale(yScale)
      .orient("left");

    var line = d3.svg.line()
      .x(function(d) { return xScale(xVal(d)); })
      .y(function(d) { return yScale(yVal(d)); })
      .defined(function(d) { return !(yVal(d) == null) && !isNaN(yVal(d)); });

    var svg = d3.select(el)
                .append("svg")
                .attr("height", h + margin.top + margin.bottom)
                .attr("width", w + margin.left + margin.right);

    var legend = d3.select(el)
                   .append("ul")
                   .classed("legend", true)
                   .select("li")
                   .data(json)
                   .enter()
                     .append("li")
                     .text(function(d) { return d.target; })
                     .style("color", function(d, index) { return colors(index); });

    svg.append("defs").append("clipPath")
      .attr("id", "clip")
      .append("rect")
      .attr("x", margin.left)
      .attr("y", 0)
      .attr("width", w)
      .attr("height", h);

    svg.selectAll("g.series")
      .data(json, function(d) { return d.target; })
      .enter().append("g")
        .attr("class", "series")
        .attr("clip-path", "url(#clip)")
        .attr("stroke", function(d, index) {
          return colors(index);
        })
        .selectAll("path.line")
          .data(function(d) { return [d.datapoints]; })
          .enter().append("path")
            .classed("line", true)
            .attr("d", function(d) {
              return line(d);
            });

    svg.append("g")
      .classed("x-axis", true)
      .attr("transform", "translate(0, " + h + ")")
      .call(xAxis);

    svg.append("g")
      .classed("y-axis", true)
      .attr("transform", "translate(" + margin.left + ", 0)")
      .call(yAxis);

    var focus = svg.append("g")
      .attr("class", "focus")
      .attr("transform", "translate(" + margin.left + ", 0)")
      .style("display", "none");

    focus.append("line")
      .attr("x1", 0)
      .attr("x2", 0)
      .attr("y1", 0)
      .attr("y2", h);

    var annotation = focus.append("g")
      .classed("annotation", true)
      .attr("transform", "translate(0, " + h + ")");

    var graph = {
      svg: svg,
      xScale: xScale,
      yScale: yScale,
      xAxis:  xAxis,
      yAxis:  yAxis,
      line:   line,
      w:      w,
      h:      h,
      margin: margin,
      colors: colors
    };

    svg.append("rect")
      .attr("class", "overlay")
      .attr("x", margin.left)
      .attr("y", 0)
      .attr("width", w)
      .attr("height", h)
      .on("mouseover", function() { focus.style("display", null); })
      .on("mouseout",  function() { focus.style("display", "none"); })
      .on("mousemove", function() {
        /* TODO validate the assumption that the first series in the json will
         * have x values for the whole shebang */

        renderAnnotation(graph, xScale.invert(d3.mouse(this)[0]));
      });


    return function(newData) {
      rerenderGraph(graph, newData);
    };
  }

  function renderAnnotation(graph, x) {
    function datapointAt(datapoints, x) {
      var i = bisectDate(datapoints, x, 1);
      var d0 = datapoints[i - 1];
      var d1 = datapoints[i];
      if(d0 && d1) {
        if(x - xVal(d0) > xVal(d1) - x) {
          var d = d1;
        } else {
          var d = d0;
          i = i - 1;
        }
      } else if(d0) {
        var d = d0;
      } else if(d1) {
        var d = d1;
      } else {
        // TODO
      }
      return d;
    }

    var textHeight = "20"; //em
    var formatter = d3.format(".2f");

    var annotation = graph.svg.select("g.annotation");
    var data = graph.svg.selectAll("g.series").data();
    var values = data.map(function(d) {
      var datapoint = datapointAt(d.datapoints, x);
      return { target: d.target,
               time:  xVal(datapoint),
               value: yVal(datapoint) };
    });
    graph.svg.select("g.focus")
      .attr("transform", "translate(" + graph.xScale(values[0].time) + ",0)");
    var text = annotation.selectAll("text")
      .data(values, function(d) { return d.target + " " + d.value; });
    text.enter()
      .append("text")
      .attr("transform", function(d, i) {
        return "translate(0, " + i * textHeight + ")";
      })
      .attr("stroke", function(d, index) { return graph.colors(index); })
      .text(function(d) { return formatter(d.value); });
    text.exit()
      .remove();
  }

  function rerenderGraph(graph, newData) {
    function withoutDropped(f) {
      return function(d,i) {
        return f(d.datapoints.slice(dropped[i]));
      }
    }

    var data = [];
    var oldData = graph.svg.selectAll("g.series").data();
    var dropped = [];

    for(var i = 0; i < oldData.length; i++) {
      var oldDates = oldData[i].datapoints.map(xVal);
      var newDates = newData[i].datapoints.map(xVal);
      dropped[i] = d3.bisectLeft(oldDates, newDates[0]);
      data[i] = {
        target: newData[i].target,
        datapoints: oldData[i].datapoints.slice(0, dropped[i]).concat(newData[i].datapoints)
      }
    };

    graph.xScale.domain([
      d3.min(data, withoutDropped(function(d) { return d3.min(d, xVal) })),
      d3.max(data, withoutDropped(function(d) { return d3.max(d, xVal) })),
    ]);

    /* Draw the line with the new xscale, but translated back to the right */
    graph.svg.selectAll("g.series")
      .data(data, function(d) { return d.target; })
      .selectAll("path.line")
        .data(function(d) { return [d.datapoints]; })
        .attr("d", graph.line)
        .attr("transform", "translate(" + (graph.xScale(xVal(data[0].datapoints[2])) - graph.margin.left) + ",0)");

    graph.yScale.domain([
      d3.min(data, withoutDropped(function(d) { return d3.min(d, yVal) })),
      d3.max(data, withoutDropped(function(d) { return d3.max(d, yVal) })),
    ]).nice();

    graph.xAxis.scale(graph.xScale);
    graph.yAxis.scale(graph.yScale);

    var t = graph.svg.transition()
      .duration(300)
      .ease("linear");

    t.selectAll("g.series path")
      .attr("d", graph.line)
      .attr("transform", "translate(0,0)");
    t.select("g.x-axis").call(graph.xAxis);
    t.select("g.y-axis").call(graph.yAxis);

    for(var i = 0; i < data.length; i++) {
      data[i].datapoints.shift();
    }
  }

  function randomSeries(name, start, stop, step) {
    var rand = d3.random.normal(100, 10);
    var times = d3.range(start, stop, step);
    var series = times.map(function(time) {
      return [rand(), time];
    });

    return function(steps) {
      if(steps != 0) {
        var lastTime = series[series.length - 1][1];
        var extraTimes = d3.range(lastTime + step, lastTime + step + steps * step, step);
        series = series.slice(steps).concat(extraTimes.map(function(time) {
          return [rand(), time];
        }));
      }
      return { target: name, datapoints: series };
    }
  }

  getGraphSources().forEach(function(source) {
    var start = 1364523350;
    var data = [
      randomSeries('a', start, start + 60, 10),
      randomSeries('b', start, start + 60, 10),
      randomSeries('c', start, start + 60, 10),
    ];

    var tick = renderGraph("body", data.map(function(d) { return d(0); }));
    var update = function() {
      tick(data.map(function(d) { return d(1); }));
    };

    setTimeout(update, 1000);
  })

  //getGraphSources().forEach(function(source) {
  //  d3.json(source, function(err, json) {
  //    if(err && !json) {
  //      renderError(err, source);
  //    } else {
  //      var tick = renderGraph("body", json),
  //          update = function() {
  //            d3.json(source, function(err, json) {
  //              if(err && !json) {
  //                renderError(err, source);
  //              } else {
  //                tick(json);
  //              }
  //            });
  //          };
  //      //setTimeout(update, 10000);
  //      setInterval(update, 10000);
  //    }
  //  });
  //});
})();
