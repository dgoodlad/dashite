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
      .defined(function(d) { return !(yVal(d) == null) && !isNaN(yVal(d)); });

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

    svg.append("defs").append("clipPath")
      .attr("id", "clip")
      .append("rect")
      .attr("x", padding)
      .attr("y", 0)
      .attr("width", w - (2 * padding))
      .attr("height", h - padding);

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
        var data = d3.selectAll("g.series").datum();
        var x0 = xScale.invert(d3.mouse(this)[0]),
            i = bisectDate(data.datapoints, x0, 1),
            d0 = data.datapoints[i - 1],
            d1 = data.datapoints[i];
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

    var tick = function(newJson) {
      var data = [];
      var lastData = d3.selectAll("g.series").data();
      for(var i = 0; i < lastData.length; i++) {
        var droppedPointCount = d3.bisectLeft(
          lastData[i].datapoints.map(function(d) { return d[1]; }),
          newJson[i].datapoints[0][1]
        );
        var addedPointCount = newJson[i].datapoints.length - lastData[i].datapoints.length;
        data[i] = {
          target: newJson[i].target,
          datapoints: lastData[i].datapoints.slice(0, droppedPointCount).concat(newJson[i].datapoints)
        }
      };

      xScale.domain([
        d3.min(data, function(d) { return d3.min(d.datapoints.slice(1), xVal) }),
        d3.max(data, function(d) { return d3.max(d.datapoints.slice(1), xVal) })
      ]);

      /* Draw the line with the new xscale, but translated back to the right */
      svg.selectAll("g.series")
        .data(data, function(d) { return d.target; })
        .selectAll("path.line")
          .data(function(d) { return [d.datapoints]; })
          .attr("d", line)
          .attr("transform", "translate(" + (xScale(xVal(data[0].datapoints[2])) - padding) + ",0)");

      yScale.domain([
        d3.min(data, function(d) { return d3.min(d.datapoints.slice(1), yVal) }),
        d3.max(data, function(d) { return d3.max(d.datapoints.slice(1), yVal) }),
      ]);

      xAxis.scale(xScale);
      yAxis.scale(yScale);

      var t = svg.transition()
        .duration(300)
        .ease("linear")

      t.selectAll("g.series path")
        .attr("d", line)
        .attr("transform", "translate(0,0)");
      t.select("g.x-axis").call(xAxis);
      t.select("g.y-axis").call(yAxis);

      for(var i = 0; i < data.length; i++) {
        data[i].datapoints.shift();
      }
    }

    return tick;
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
        console.log(series);
      }
      return { target: 'a', datapoints: series };
    }
  }

  //getGraphSources().forEach(function(source) {
  //  var start = 1364523350;
  //  var data = randomSeries('a', start, start + 60, 10);

  //  var tick = renderGraph("body", [data(0)]);
  //  var update = function() {
  //    tick([data(1)]);
  //  };

  //  setInterval(update, 10000);
  //})

  getGraphSources().forEach(function(source) {
    d3.json(source, function(err, json) {
      if(err && !json) {
        renderError(err, source);
      } else {
        var tick = renderGraph("body", json),
            update = function() {
              d3.json(source, function(err, json) {
                if(err && !json) {
                  renderError(err, source);
                } else {
                  tick(json);
                }
              });
            };
        //setTimeout(update, 10000);
        setInterval(update, 10000);
      }
    });
  });
})();
