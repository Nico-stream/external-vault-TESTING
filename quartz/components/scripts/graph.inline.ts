import type { ContentDetails, ContentIndex } from "../../plugins/emitters/contentIndex"
import * as d3 from "d3"
import { registerEscapeHandler, removeAllChildren } from "./util"
import { FullSlug, SimpleSlug, getFullSlug, resolveRelative, simplifySlug } from "../../util/path"

type NodeData = {
  id: SimpleSlug
  text: string
  tags: string[]
} & d3.SimulationNodeDatum

type LinkData = {
  source: SimpleSlug
  target: SimpleSlug
}

const localStorageKey = "graph-visited"
function getVisited(): Set<SimpleSlug> {
  return new Set(JSON.parse(localStorage.getItem(localStorageKey) ?? "[]"))
}

function addToVisited(slug: SimpleSlug) {
  const visited = getVisited()
  visited.add(slug)
  localStorage.setItem(localStorageKey, JSON.stringify([...visited]))
}

async function renderGraph(container: string, fullSlug: FullSlug) {
  const slug = simplifySlug(fullSlug)
  const visited = getVisited()
  const graph = document.getElementById(container)
  const isLocal = container === "graph-container";  //! CUSTOM
  if (!graph) return
  removeAllChildren(graph)

  let {
    drag: enableDrag,
    zoom: enableZoom,
    depth,
    scale,
    repelForce,
    centerForce,
    linkDistance,
    fontSize,
    opacityScale,
    removeTags,
    showTags,
    focusOnHover,
  } = JSON.parse(graph.dataset["cfg"]!)

  const data: Map<SimpleSlug, ContentDetails> = new Map(
    Object.entries<ContentDetails>(await fetchData).map(([k, v]) => [
      simplifySlug(k as FullSlug),
      v,
    ]),
  )
  const links: LinkData[] = []
  const tags: SimpleSlug[] = []

  const validLinks = new Set(data.keys())
  for (const [source, details] of data.entries()) {
    const outgoing = details.links ?? []

    for (const dest of outgoing) {
      if (validLinks.has(dest)) {
        links.push({ source: source, target: dest })
      }
    }

    if (showTags) {
      const localTags = details.tags
        .filter((tag) => !removeTags.includes(tag))
        .map((tag) => simplifySlug(("tags/" + tag) as FullSlug))

      tags.push(...localTags.filter((tag) => !tags.includes(tag)))

      for (const tag of localTags) {
        links.push({ source: source, target: tag })
      }
    }
  }

  const neighbourhood = new Set<SimpleSlug>()
  const wl: (SimpleSlug | "__SENTINEL")[] = [slug, "__SENTINEL"]
  
  //! CUSTOM SECTION
  // console.log("HELLO; WORLD!");
  let i = 0;
  const show_orphans = false;
  const keep_connection: boolean[] = Array(links.length).fill(true);
  let global_depth = 0;

  if (isLocal) {

    const queue: SimpleSlug[] = [slug];
    const queue_depth: number[] = [0];
    const hashmap: Record<SimpleSlug, boolean> = {};
    const hashmap_temporary_bucket: SimpleSlug[] = [];
    hashmap[slug] = true;
    neighbourhood.add(slug);

    const neighboring_links_function = (cur: SimpleSlug, conn1: SimpleSlug, conn2: SimpleSlug, i: number) => {
      if (conn1 !== cur) return false;
          
        if (hashmap[conn2]) { 
          keep_connection[i] = false;
          return false;
        }
        neighbourhood.add(conn2)
        return true;
    }

    while (queue.length > 0) {
      const cur = queue.shift()!
      const current_depth = queue_depth.shift()!
      // console.log("H0 ", cur, current_depth)

      if (global_depth != current_depth) {
        // console.log("--------------")
        // console.log(current_depth)
        global_depth = current_depth

        hashmap_temporary_bucket.forEach((l) => { hashmap[l] = true; });
        hashmap_temporary_bucket.length = 0;
      }
      
      if (depth == -1 || current_depth <= depth) {   
        const outgoing = links.filter((l, i) => neighboring_links_function(cur, l.source, l.target, i))
        let incoming: LinkData[] = [] // links.filter((l) => l.target === cur)
        if (!isLocal) incoming = links.filter((l) => neighboring_links_function(cur, l.target, l.source, i));
        queue.push(...outgoing.map((l) => l.target), ...incoming.map((l) => l.source))
        queue_depth.push(...Array(outgoing.length+incoming.length).fill(current_depth+1))
        hashmap_temporary_bucket.push(...outgoing.map((l) => l.target), ...incoming.map((l) => l.source))
      }
    }

    // while (depth >= 0 && wl.length > 0) {
    //   // compute neighbours
    //   const cur = wl.shift()!
    //   console.log("cur", cur)
    //   if (cur === "__SENTINEL") {
    //     depth--
    //     wl.push("__SENTINEL")
    //     if (i == 1) break;
    //     i++;
    //   } else {
    //     console.log("cur ADD", cur)
    //     neighbourhood.add(cur)
    //     const outgoing = links.filter((l) => l.source === cur)
    //     const incoming: LinkData[] = links.filter((l) => l.target === cur)
    //     wl.push(...outgoing.map((l) => l.target), ...incoming.map((l) => l.source))
    //   }
    // }
  } else {
    const hashmap: Record<SimpleSlug, boolean> = {};
    if (!show_orphans) {
      links.forEach(l => { 
        if (!hashmap[l.target] || !hashmap[l.source])  {
          hashmap[l.target] = true; 
          hashmap[l.source] = true; 
        }
      })
    }
    validLinks.forEach((id) => { if (show_orphans || hashmap[id]) neighbourhood.add(id) })
    if (showTags) tags.forEach((tag) => neighbourhood.add(tag))
  }
  //! ------------------------------------------------

  const graphData: { nodes: NodeData[]; links: LinkData[] } = {
    nodes: [...neighbourhood].map((url) => {
      const text = url.startsWith("tags/") ? "#" + url.substring(5) : data.get(url)?.title ?? url
      return {
        id: url,
        text: text,
        tags: data.get(url)?.tags ?? [],
      }
    }),
    links: links.filter((l, i) => neighbourhood.has(l.source) && neighbourhood.has(l.target) && keep_connection[i]), //! CUSTOM
  }

  const simulation: d3.Simulation<NodeData, LinkData> = d3
    .forceSimulation(graphData.nodes)
    .force("charge", d3.forceManyBody().strength(-100 * repelForce))
    .force(
      "link",
      d3
        .forceLink(graphData.links)
        .id((d: any) => d.id)
        .distance(linkDistance),
    )
    .force("center", d3.forceCenter().strength(centerForce))

  const height = isLocal ? 450 : Math.max(graph.offsetHeight, 250)  //! CUSTOM
  const width = graph.offsetWidth

  const svg = d3
    .select<HTMLElement, NodeData>("#" + container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [-width / 2 / scale, -height / 2 / scale, width / scale, height / scale])

  // draw links between nodes
  const link = svg
    .append("g")
    .selectAll("line")
    .data(graphData.links)
    .join("line")
    .attr("class", "link")
    .attr("stroke", "var(--lightgray)")
    .attr("stroke-width", 1)

  // svg groups
  const graphNode = svg.append("g").selectAll("g").data(graphData.nodes).enter().append("g")

  // calculate color
  const color = (d: NodeData) => {
    const isCurrent = d.id === slug
    if (isCurrent) {
      return "var(--secondary)"
    } else if (visited.has(d.id) || d.id.startsWith("tags/")) {
      return "var(--tertiary)"
    } else {
      return "var(--gray)"
    }
  }

  //! CUSTOM SECTION
  const highlight_graph = (linkNodes: d3.Selection<d3.BaseType, unknown, HTMLElement, any>) => {
    // fade out non-neighbour nodes
    connectedNodes = linkNodes.data().flatMap((d: any) => [d.source.id, d.target.id])

    d3.selectAll<HTMLElement, NodeData>(".link")
      .transition()
      .duration(200)
      .style("opacity", 0.2)
    d3.selectAll<HTMLElement, NodeData>(".node")
      .filter((d) => !connectedNodes.includes(d.id))
      .transition()
      .duration(200)
      .style("opacity", 0.2)
    d3.selectAll<HTMLElement, NodeData>("text")
      .filter((d) => !connectedNodes.includes(d.id))
      .transition()
      .duration(200)
      .style("opacity", 0.2)
  };
  const de_highlight_graph = () => {
    d3.selectAll<HTMLElement, NodeData>(".link").transition().duration(200).style("opacity", 1)
    d3.selectAll<HTMLElement, NodeData>(".node").transition().duration(200).style("opacity", 1)
    d3.selectAll<HTMLElement, NodeData>("text").transition().duration(200).style("opacity", 1)  //! CUSTOM
  };

  let DRAGGING = false;
  let ONTOP    = false;
  let K_ZOOM   = 1;
  //! ------------------------------------------------

  const drag = (simulation: d3.Simulation<NodeData, LinkData>) => {
    function dragstarted(event: any, d: NodeData) {
      if (!event.active) simulation.alphaTarget(1).restart()
      d.fx = d.x
      d.fy = d.y
      DRAGGING = true;  //! CUSTOM
    }

    function dragged(event: any, d: NodeData) {
      d.fx = event.x
      d.fy = event.y
    }

    function dragended(event: any, d: NodeData) {
      if (!event.active) simulation.alphaTarget(0)
      d.fx = null
      d.fy = null

      //! CUSTOM
      DRAGGING = false;
      if (!ONTOP) de_highlight_graph();
    }

    const noop = () => {}
    return d3
      .drag<Element, NodeData>()
      .on("start", enableDrag ? dragstarted : noop)
      .on("drag", enableDrag ? dragged : noop)
      .on("end", enableDrag ? dragended : noop)
  }

  function nodeRadius(d: NodeData) {
    const numLinks = links.filter((l: any) => l.source.id === d.id || l.target.id === d.id).length
    return (2 * 2 + Math.sqrt(numLinks))   //! CUSTOM
  }

  let connectedNodes: SimpleSlug[] = []

  // draw individual nodes
  const node = graphNode
    .append("circle")
    .attr("class", "node")
    .attr("id", (d) => d.id)
    .attr("r", nodeRadius)
    .attr("fill", color)
    .style("cursor", "pointer")
    .on("click", (_, d) => {
      const targ = resolveRelative(fullSlug, d.id)
      window.spaNavigate(new URL(targ, window.location.toString()))
    })
    .on("mouseover", function (_, d) {
      ONTOP = true; //! CUSTOM
      const currentId = d.id
      const linkNodes = d3
        .selectAll(".link")
        .filter((d: any) => d.source.id === currentId || d.target.id === currentId)

      // if (focusOnHover) {
      //   // fade out non-neighbour nodes
      //   connectedNodes = linkNodes.data().flatMap((d: any) => [d.source.id, d.target.id])

      //   d3.selectAll<HTMLElement, NodeData>(".link")
      //     .transition()
      //     .duration(200)
      //     .style("opacity", 0.2)
      //   d3.selectAll<HTMLElement, NodeData>(".node")
      //     .filter((d) => !connectedNodes.includes(d.id))
      //     .transition()
      //     .duration(200)
      //     .style("opacity", 0.2)
      // }
      if (focusOnHover && !DRAGGING) highlight_graph(linkNodes); //! CUSTOM

      // highlight links
      linkNodes.transition().duration(200).attr("stroke", "var(--gray)").attr("stroke-width", 1)

      const bigFont = fontSize * 1.5

      // show text for self
      const parent = this.parentNode as HTMLElement
      d3.select<HTMLElement, NodeData>(parent)
        .raise()
        .select("text")
        .transition()
        .duration(200)
        .attr("opacityOld", d3.select(parent).select("text").style("opacity"))
        .style("opacity", 1)
        .style("font-size", bigFont + "em")
    })
    .on("mouseleave", function (_, d) {
      // if (focusOnHover) {
      //   d3.selectAll<HTMLElement, NodeData>(".link").transition().duration(200).style("opacity", 1)
      //   d3.selectAll<HTMLElement, NodeData>(".node").transition().duration(200).style("opacity", 1)
      // }
      //! CUSTOM
      ONTOP = false;
      if (focusOnHover && !DRAGGING) de_highlight_graph();
      
      const currentId = d.id
      const linkNodes = d3
        .selectAll(".link")
        .filter((d: any) => d.source.id === currentId || d.target.id === currentId)

      linkNodes.transition().duration(200).attr("stroke", "var(--lightgray)")

      const parent = this.parentNode as HTMLElement
      d3.select<HTMLElement, NodeData>(parent)
        .select("text")
        .transition()
        .duration(200)
        .style("opacity", d3.select(parent).select("text").attr("opacityOld"))
        .style("font-size", fontSize + "em")
    })
    // @ts-ignore
    .call(drag(simulation))

  // draw labels
  const labels = graphNode
    .append("text")
    .attr("dx", 0)
    .attr("dy", (d) => -nodeRadius(d) + "px")
    .attr("text-anchor", "middle")
    .text((d) => d.text)
    .style("opacity", (opacityScale - 0.25) / 0.75)  //! CUSTOM
    .style("pointer-events", "none")
    .style("font-size", fontSize + "em")
    .raise()
    // @ts-ignore
    .call(drag(simulation))

  // set panning
  if (enableZoom) {
    svg.call(
      d3
        .zoom<SVGSVGElement, NodeData>()
        .extent([
          [0, 0],
          isLocal ? [width, height] : [width*1.5, height*1.6],  //! CUSTOM
        ])
        .scaleExtent([0.25, 4])
        .on("zoom", ({ transform }) => {
          K_ZOOM = 1/transform.k; //! CUSTOM
          link.attr("transform", transform)
          node.attr("transform", transform)
          const scale = transform.k * opacityScale

          //! CUSTOM
          // const scaledOpacity = Math.max((scale - 0.25) / 0.75, 0) * (ONTOP || DRAGGING ? 1 : 0)   //! CUSTOM
          // console.log(scale, (scale - 1), scaledOpacity);
          labels.attr("transform", transform) // .style("opacity", scaledOpacity)
        }),
    )
  }

  // progress the simulation
  simulation.on("tick", () => {
    link
      .attr("x1", (d: any) => d.source.x)
      .attr("y1", (d: any) => d.source.y)
      .attr("x2", (d: any) => d.target.x)
      .attr("y2", (d: any) => d.target.y)
    node.attr("cx", (d: any) => d.x).attr("cy", (d: any) => d.y)
    labels.attr("x", (d: any) => d.x).attr("y", (d: any) => d.y)
  })
}

function renderGlobalGraph() {
  const slug = getFullSlug(window)
  const container = document.getElementById("global-graph-outer")
  const sidebar = container?.closest(".sidebar") as HTMLElement
  container?.classList.add("active")
  if (sidebar) {
    sidebar.style.zIndex = "1"
  }

  renderGraph("global-graph-container", slug)

  function hideGlobalGraph() {
    container?.classList.remove("active")
    const graph = document.getElementById("global-graph-container")
    if (sidebar) {
      sidebar.style.zIndex = "unset"
    }
    if (!graph) return
    removeAllChildren(graph)
  }

  registerEscapeHandler(container, hideGlobalGraph)
}

document.addEventListener("nav", async (e: CustomEventMap["nav"]) => {
  const slug = e.detail.url
  addToVisited(slug)
  await renderGraph("graph-container", slug)

  const containerIcon = document.getElementById("global-graph-icon")
  containerIcon?.addEventListener("click", renderGlobalGraph)
  window.addCleanup(() => containerIcon?.removeEventListener("click", renderGlobalGraph))
})
