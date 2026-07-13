import React from "react";
import ReactECharts from "echarts-for-react";

import { buildEchartsOption } from "../lib/buildEchartsOption.js";
import { validatePanelConfig } from "../lib/validateConfig.js";

function ChartPanel({
  panel,
  globalPanelColors,
  data,
  geoData,
  loadedData,
  filterDefinitions,
  filterValues,
  editMode,
  isDragging,
  isDragTarget,
  isSelected,
  multiSelectMode = false,
  isMultiSelected = false,
  onEdit,
  onRemove,
  onStartSection,
  onToggleMultiSelect,
  onFullScreenHold,
  onPointerReorder,
  onPointerDragStateChange,
}) {
  const [fullScreen, setFullScreen] = React.useState(false);
  const pointerDragRef = React.useRef(null);
  const exportRef = React.useRef(null);
  const visualPanel = resolvePanelColors(panel, globalPanelColors);
  const filteredData = applyPanelFilters(
    data ?? [],
    panel,
    panel.filters ?? [],
    filterDefinitions,
    filterValues,
  );
  const validationError = validatePanelConfig(panel, filteredData, geoData);

  const articleClassName = [
    "chart-panel",
    `chart-size-${normalizePanelSize(panel.size)}`,
    panel.type === "mapScatter" || panel.type === "choroplethMap" || panel.type === "chronoChoroplethMap" ? "chart-panel-map" : "",
    panel.type === "chronoChoroplethMap" ? "chart-panel-chrono" : "",
    editMode ? "chart-panel-editable" : "",
    isDragging ? "chart-panel-dragging" : "",
    isDragTarget ? "chart-panel-drag-target" : "",
    isSelected ? "chart-panel-selected" : "",
    isMultiSelected ? "chart-panel-multi-selected" : "",
    validationError ? "chart-panel-error" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <article
        data-panel-id={panel.id}
        className={articleClassName}
        style={{
          backgroundColor: visualPanel.panelBackgroundColor,
          borderColor: visualPanel.panelBorderColor,
          "--edit-highlight-color": visualPanel.editHighlightColor,
          "--multi-select-highlight-color": visualPanel.multiSelectHighlightColor,
        }}
        onPointerDown={(event) => startPanelPointerDrag(event, panel.id)}
        onPointerMove={movePanelPointerDrag}
        onPointerUp={endPanelPointerDrag}
        onPointerCancel={cancelPanelPointerDrag}
      >
        <PanelActionButtons
          editMode={editMode}
          infoSource={sourceNoteForPanel(panel)}
          onEdit={onEdit}
          onRemove={onRemove}
          onStartSection={onStartSection}
          multiSelectMode={multiSelectMode}
          isMultiSelected={isMultiSelected}
          onToggleMultiSelect={onToggleMultiSelect}
          onFullScreen={() => setFullScreen(true)}
          onFullScreenHold={onFullScreenHold}
          onExport={(format, dpi) => exportRef.current?.(format, dpi)}
        />
        {validationError ? (
          <>
            <h3>{panel.title}</h3>
            <p>{validationError}</p>
          </>
        ) : (
          <PanelBody panel={panel} globalPanelColors={globalPanelColors} data={filteredData} geoData={geoData} loadedData={loadedData} exportRef={exportRef} />
        )}
      </article>

      {fullScreen && (
        <div className="fullscreen-backdrop" role="dialog" aria-modal="true">
          <article className="fullscreen-panel">
            <button
              type="button"
              className="fullscreen-close-button"
              onClick={() => setFullScreen(false)}
              aria-label="Close fullscreen chart"
            >
              Close
            </button>
            {validationError ? (
              <section className="chart-panel-error fullscreen-error">
                <h3>{panel.title}</h3>
                <p>{validationError}</p>
              </section>
            ) : (
              <PanelBody panel={panel} globalPanelColors={globalPanelColors} data={filteredData} geoData={geoData} loadedData={loadedData} fullScreen />
            )}
          </article>
        </div>
      )}
    </>
  );

  function startPanelPointerDrag(event, panelId) {
    const mapBorderDrag = panel.type === "mapScatter" && isNearPanelBorder(event.currentTarget, event, 20);
    if (!editMode || event.button !== 0 || (!mapBorderDrag && (panel.type === "mapScatter" || isInteractiveTarget(event.target)))) {
      return;
    }
    pointerDragRef.current = {
      panelId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function movePanelPointerDrag(event) {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.dragging && moved > 8) {
      drag.dragging = true;
      onPointerDragStateChange?.(drag.panelId, null);
    }
    if (!drag.dragging) {
      return;
    }
    event.preventDefault();
    const targetPanel = document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".chart-panel[data-panel-id]");
    const targetPanelId = targetPanel?.dataset?.panelId;
    onPointerDragStateChange?.(drag.panelId, targetPanelId && targetPanelId !== drag.panelId ? targetPanelId : null);
  }

  function endPanelPointerDrag(event) {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    if (drag.dragging) {
      event.preventDefault();
      const targetPanel = document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".chart-panel[data-panel-id]");
      const targetPanelId = targetPanel?.dataset?.panelId;
      if (targetPanelId && targetPanelId !== drag.panelId) {
        onPointerReorder?.(drag.panelId, targetPanelId);
      }
    }
    onPointerDragStateChange?.(null, null);
    pointerDragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function cancelPanelPointerDrag(event) {
    if (pointerDragRef.current?.pointerId === event.pointerId) {
      onPointerDragStateChange?.(null, null);
      pointerDragRef.current = null;
    }
  }
}

function isInteractiveTarget(target) {
  return Boolean(target?.closest?.("button, input, select, textarea, a, .tile-map-panel"));
}

function isNearPanelBorder(element, event, threshold) {
  const rect = element.getBoundingClientRect();
  return (
    event.clientX - rect.left <= threshold ||
    rect.right - event.clientX <= threshold ||
    event.clientY - rect.top <= threshold ||
    rect.bottom - event.clientY <= threshold
  );
}

const NON_ECHART_TYPES = new Set(["kpi", "table", "deltaList", "image"]);
const tileMapViewStateByPanelId = new Map();

function PanelActionButtons({
  editMode,
  infoSource,
  multiSelectMode,
  isMultiSelected,
  onEdit,
  onRemove,
  onStartSection,
  onToggleMultiSelect,
  onFullScreen,
  onFullScreenHold,
  onExport,
}) {
  const holdTimerRef = React.useRef(null);
  const holdTriggeredRef = React.useRef(false);
  const [exportOpen, setExportOpen] = React.useState(false);

  function startFullScreenPress(event) {
    holdTriggeredRef.current = false;
    window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = window.setTimeout(() => {
      holdTriggeredRef.current = true;
      onFullScreenHold?.();
    }, 650);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function endFullScreenPress() {
    window.clearTimeout(holdTimerRef.current);
  }

  function clickFullScreen(event) {
    if (holdTriggeredRef.current) {
      event.preventDefault();
      return;
    }
    onFullScreen();
  }

  return (
    <div className="chart-action-buttons">
      <span className="chart-export-control">
        <button
          type="button"
          className="chart-icon-button chart-export-button"
          aria-label="Export chart"
          title="Export chart"
          onClick={() => setExportOpen((current) => !current)}
        >
          <DownloadIcon />
        </button>
        {exportOpen && (
          <span className="chart-export-menu">
            {[96, 150, 300].map((dpi) => (
              <React.Fragment key={dpi}>
                <button type="button" onClick={() => { setExportOpen(false); onExport?.("png", dpi); }}>PNG {dpi} DPI</button>
                <button type="button" onClick={() => { setExportOpen(false); onExport?.("jpeg", dpi); }}>JPEG {dpi} DPI</button>
              </React.Fragment>
            ))}
          </span>
        )}
      </span>
      <button
        type="button"
        className="chart-icon-button chart-fullscreen-button"
        onPointerDown={startFullScreenPress}
        onPointerUp={endFullScreenPress}
        onPointerCancel={endFullScreenPress}
        onPointerLeave={endFullScreenPress}
        onClick={clickFullScreen}
        aria-label="Fullscreen chart"
        title="Click for fullscreen. Hold for multi-fullscreen selection."
      >
        <FullscreenIcon />
      </button>
      <span className="chart-info-control">
        <button
          type="button"
          className="chart-icon-button chart-info-button"
          aria-label="Chart information source"
        >
          i
        </button>
        <span className="chart-info-tooltip" role="tooltip">
          {infoSource}
        </span>
      </span>
      {multiSelectMode && (
        <button type="button" className="chart-edit-button" onClick={onToggleMultiSelect}>
          {isMultiSelected ? "Selected" : "Select"}
        </button>
      )}
      {editMode && (
        <>
          <button type="button" className="chart-edit-button chart-panel-action-button" onClick={onEdit} aria-label="Edit panel" title="Edit panel">
            <EditIcon />
          </button>
          <button type="button" className="chart-edit-button chart-panel-action-button" onClick={onStartSection} aria-label="Start a section here" title="Start a section here">
            <StartSectionIcon />
          </button>
          <button
            type="button"
            className="chart-remove-button chart-panel-action-button"
            onClick={() => {
              if (window.confirm("Remove this panel?")) {
                onRemove();
              }
            }}
            aria-label="Remove panel"
            title="Remove panel"
          >
            <RemoveIcon />
          </button>
        </>
      )}
    </div>
  );
}

function IconSvg({ children }) {
  return (
    <svg className="chart-svg-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

function DownloadIcon() {
  return (
    <IconSvg>
      <path d="M12 4v10" />
      <path d="M7.5 10.5 12 15l4.5-4.5" />
      <path d="M5 19h14" />
    </IconSvg>
  );
}

function FullscreenIcon() {
  return (
    <IconSvg>
      <path d="M8 4H4v4" />
      <path d="M16 4h4v4" />
      <path d="M20 16v4h-4" />
      <path d="M8 20H4v-4" />
    </IconSvg>
  );
}

function EditIcon() {
  return (
    <IconSvg>
      <path d="M5 19h4.5L19 9.5 14.5 5 5 14.5V19z" />
      <path d="M13.5 6 18 10.5" />
    </IconSvg>
  );
}

function StartSectionIcon() {
  return (
    <IconSvg>
      <path d="M5 6h14" />
      <path d="M5 18h14" />
      <path d="M12 9v6" />
      <path d="M9 12h6" />
    </IconSvg>
  );
}

function RemoveIcon() {
  return (
    <IconSvg>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </IconSvg>
  );
}

function PlayIcon() {
  return (
    <IconSvg>
      <path d="M8 5v14l11-7-11-7z" />
    </IconSvg>
  );
}

function PauseIcon() {
  return (
    <IconSvg>
      <path d="M8 5v14" />
      <path d="M16 5v14" />
    </IconSvg>
  );
}

function replaceMergeForPanel(panel) {
  if (panel.type === "choroplethMap" || panel.type === "chronoChoroplethMap") {
    return ["series", "geo", "visualMap"];
  }
  if (panel.dataBinding) {
    return ["series", "legend", "xAxis", "yAxis"];
  }
  return undefined;
}

export function PanelBody({ panel, globalPanelColors, data, geoData, loadedData = {}, fullScreen = false, multiFullScreen = false, exportRef }) {
  const containerRef = React.useRef(null);
  const chartRef = React.useRef(null);
  const dimensions = useElementDimensions(containerRef);
  const visualPanel = React.useMemo(() => resolvePanelColors(panel, globalPanelColors), [panel, globalPanelColors]);
  const renderContext = React.useMemo(() => ({
    ...chartRenderContext(visualPanel, fullScreen, dimensions, multiFullScreen),
    loadedData,
  }), [visualPanel, fullScreen, dimensions.width, dimensions.height, multiFullScreen, loadedData]);
  const echartsOption = React.useMemo(
    () => {
      if (NON_ECHART_TYPES.has(visualPanel.type) || visualPanel.type === "mapScatter" || visualPanel.type === "chronoChoroplethMap") {
        return null;
      }
      return buildEchartsOption(visualPanel, data, geoData, renderContext);
    },
    [visualPanel, data, geoData, renderContext],
  );

  React.useEffect(() => {
    const resize = () => chartRef.current?.getEchartsInstance?.().resize();
    const frame = window.requestAnimationFrame(resize);
    // Mobile browsers can finish expanding the visual viewport after the
    // fullscreen panel has rendered. Resize once more after that transition.
    const timer = window.setTimeout(resize, 220);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", resize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      viewport?.removeEventListener("resize", resize);
    };
  }, [dimensions.width, dimensions.height, fullScreen, visualPanel.size]);

  React.useEffect(() => {
    if (!exportRef) {
      return undefined;
    }
    exportRef.current = (format, dpi) => exportPanelImage({
      panel: visualPanel,
      chartRef,
      container: containerRef.current,
      format,
      dpi,
    });
    return () => {
      exportRef.current = null;
    };
  }, [exportRef, visualPanel, dimensions.width, dimensions.height]);

  if (visualPanel.type === "kpi") {
    return <KpiPanel panel={visualPanel} data={data} />;
  }
  if (visualPanel.type === "table") {
    return <TablePanel panel={visualPanel} data={data} />;
  }
  if (visualPanel.type === "deltaList") {
    return <DeltaListPanel panel={visualPanel} data={data} />;
  }
  if (visualPanel.type === "image") {
    return (
      <div
        ref={containerRef}
        className={multiFullScreen ? "chart-canvas chart-canvas-multi" : fullScreen ? "chart-canvas chart-canvas-fullscreen" : "chart-canvas"}
        style={{ backgroundColor: visualPanel.chartAreaColor, borderColor: visualPanel.chartAreaBorderColor }}
      >
        <ImagePanel panel={visualPanel} fullScreen={fullScreen && !multiFullScreen} />
      </div>
    );
  }
  if (visualPanel.type === "mapScatter") {
    return (
      <div
        ref={containerRef}
        className={multiFullScreen ? "chart-canvas chart-canvas-multi" : fullScreen ? "chart-canvas chart-canvas-fullscreen" : "chart-canvas"}
        style={{ backgroundColor: visualPanel.chartAreaColor, borderColor: visualPanel.chartAreaBorderColor }}
      >
        <TileMapPanel panel={visualPanel} data={data} geoData={geoData} dimensions={dimensions} />
      </div>
    );
  }
  if (visualPanel.type === "chronoChoroplethMap") {
    return (
      <div
        ref={containerRef}
        className={multiFullScreen ? "chart-canvas chart-canvas-multi chart-canvas-chrono" : fullScreen ? "chart-canvas chart-canvas-fullscreen chart-canvas-chrono" : "chart-canvas chart-canvas-chrono"}
        style={{ backgroundColor: visualPanel.chartAreaColor, borderColor: visualPanel.chartAreaBorderColor }}
      >
        <ChronoChoroplethPanel
          panel={visualPanel}
          data={data}
          geoData={geoData}
          renderContext={renderContext}
          chartRef={chartRef}
        />
      </div>
    );
  }
  if (!NON_ECHART_TYPES.has(visualPanel.type)) {
    return (
      <div
        ref={containerRef}
        className={multiFullScreen ? "chart-canvas chart-canvas-multi" : fullScreen ? "chart-canvas chart-canvas-fullscreen" : "chart-canvas"}
        style={{ backgroundColor: visualPanel.chartAreaColor, borderColor: visualPanel.chartAreaBorderColor }}
      >
        <ReactECharts
          ref={chartRef}
          option={echartsOption}
          className="chart-canvas-inner"
          style={{ height: "100%", width: "100%" }}
          opts={{ renderer: visualPanel.type === "gauge" ? "svg" : "canvas" }}
          notMerge={false}
          replaceMerge={replaceMergeForPanel(visualPanel)}
          lazyUpdate
        />
      </div>
    );
  }
  return null;
}

function ChronoChoroplethPanel({ panel, data, geoData, renderContext, chartRef }) {
  const dateColumn = panel.dateSelection?.column ?? panel.dateField ?? "Datum";
  const dates = React.useMemo(() => uniqueSortedDates(data, dateColumn), [data, dateColumn]);
  const rowsByDate = React.useMemo(() => groupRowsByValue(data, dateColumn), [data, dateColumn]);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [speed, setSpeed] = React.useState(() => Number(panel.timelapseSpeed ?? 1));
  const [playing, setPlaying] = React.useState(false);
  const preservedGeoView = React.useRef(null);
  const boundedIndex = Math.min(activeIndex, Math.max(dates.length - 1, 0));
  const activeDate = dates[boundedIndex] ?? "";
  const activeRows = React.useMemo(
    () => rowsByDate.get(String(activeDate)) ?? [],
    [rowsByDate, activeDate],
  );
  const activePanel = React.useMemo(
    () => ({ ...panel, type: "choroplethMap", dateSelection: { column: dateColumn, mode: "single", value: activeDate } }),
    [panel, dateColumn, activeDate],
  );
  const chronoOption = React.useMemo(
    () => {
      const option = buildEchartsOption(activePanel, activeRows, geoData, renderContext);
      if (preservedGeoView.current) {
        option.geo = {
          ...option.geo,
          ...preservedGeoView.current,
        };
      }
      return option;
    },
    [activePanel, activeRows, geoData, renderContext],
  );

  const chartEvents = React.useMemo(() => ({
    georoam: () => {
      const instance = chartRef.current?.getEchartsInstance?.();
      const option = instance?.getOption?.();
      const geoOption = Array.isArray(option?.geo) ? option.geo[0] : option?.geo;
      if (geoOption) {
        preservedGeoView.current = {
          center: geoOption.center,
          zoom: geoOption.zoom,
        };
      }
    },
  }), [chartRef]);

  React.useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(dates.length - 1, 0)));
  }, [dates.length]);

  React.useEffect(() => {
    if (!playing || dates.length <= 1) {
      return undefined;
    }
    const intervalMs = Math.max(180, 900 / clamp(speed, 1, 3));
    const timer = window.setInterval(() => {
      setActiveIndex((current) => {
        if (current >= dates.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [playing, dates.length, speed]);

  return (
    <div className="chrono-choropleth-shell">
      <ReactECharts
        ref={chartRef}
        option={chronoOption}
        className="chart-canvas-inner chrono-choropleth-chart"
        style={{ height: "100%", width: "100%" }}
        opts={{ renderer: "canvas" }}
        notMerge={false}
        replaceMerge={["series", "visualMap"]}
        onEvents={chartEvents}
        lazyUpdate
      />
      <div className="chrono-map-date-display" aria-live="polite">{activeDate}</div>
      <div className="chrono-timeline" aria-label="Animated choropleth timeline">
        <button
          type="button"
          className="chrono-play-button"
          onClick={() => setPlaying((current) => !current)}
          disabled={dates.length <= 1}
          aria-label={playing ? "Pause timelapse" : "Play timelapse"}
          title={playing ? "Pause" : "Play"}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <span>{dates[0] ?? ""}</span>
        <label className="chrono-slider-label">
          <input
            type="range"
            min="0"
            max={Math.max(dates.length - 1, 0)}
            step="1"
            value={boundedIndex}
            onChange={(event) => {
              setPlaying(false);
              setActiveIndex(Number(event.target.value));
            }}
          />
          <strong style={{ left: `${dates.length > 1 ? (boundedIndex / (dates.length - 1)) * 100 : 0}%` }}>{activeDate}</strong>
        </label>
        <span>{dates[dates.length - 1] ?? ""}</span>
        <div className="chrono-speed-buttons" aria-label="Timelapse speed">
          {[1, 2, 3].map((item) => (
            <button
              key={item}
              type="button"
              className={speed === item ? "active" : "secondary"}
              onClick={() => setSpeed(item)}
            >
              {item}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TileMapPanel({ panel, data, geoData, dimensions }) {
  const mapRef = React.useRef(null);
  const initialView = tileMapViewStateByPanelId.get(panel.id) ?? {
    zoom: panel.tileZoom ?? 7,
    center: {
      lat: panel.tileCenterLat ?? 52.12,
      lon: panel.tileCenterLon ?? 5.28,
    },
  };
  const [targetZoom, setTargetZoom] = React.useState(initialView.zoom);
  const [renderZoom, setRenderZoom] = React.useState(initialView.zoom);
  const [center, setCenter] = React.useState(initialView.center);
  const dragState = React.useRef(null);
  const width = Math.max(dimensions.width || 520, 320);
  const height = Math.max(dimensions.height || 380, 260);
  const zoom = renderZoom;
  const tileZoom = Math.floor(zoom);
  const tileScale = 2 ** (zoom - tileZoom);
  const centerPixel = lonLatToGlobalPixel(center.lon, center.lat, zoom);
  const origin = {
    x: centerPixel.x - width / 2,
    y: centerPixel.y - height / 2,
  };
  const tiles = visibleTiles(origin, width, height, zoom, tileZoom, tileScale);
  const values = data.map((row) => Number(row[panel.valueField] ?? 0));
  const maxValue = Math.max(...values, 1);
  const boundaryOffsetX = 0;
  const boundaryOffsetY = 0;

  React.useEffect(() => {
    let frameId;
    function animateZoom() {
      setRenderZoom((current) => {
        const delta = targetZoom - current;
        if (Math.abs(delta) < 0.006) {
          return targetZoom;
        }
        frameId = window.requestAnimationFrame(animateZoom);
        return current + delta * 0.24;
      });
    }
    frameId = window.requestAnimationFrame(animateZoom);
    return () => window.cancelAnimationFrame(frameId);
  }, [targetZoom]);

  React.useEffect(() => {
    tileMapViewStateByPanelId.set(panel.id, {
      zoom: targetZoom,
      center,
    });
  }, [panel.id, targetZoom, center]);

  React.useEffect(() => {
    const element = mapRef.current;
    if (!element) {
      return undefined;
    }
    function handleNativeWheel(event) {
      event.preventDefault();
      event.stopPropagation();
      setTargetZoom((current) => clamp(current + (event.deltaY < 0 ? 0.35 : -0.35), 5, 10));
    }
    element.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleNativeWheel);
  }, []);

  function project(lon, lat) {
    const pixel = lonLatToGlobalPixel(lon, lat, zoom);
    return {
      x: pixel.x - origin.x,
      y: pixel.y - origin.y,
    };
  }

  function zoomBy(delta) {
    setTargetZoom((current) => clamp(current + delta, 5, 10));
  }

  function resetMapView() {
    const defaultZoom = panel.tileZoom ?? 7;
    const defaultCenter = {
      lat: panel.tileCenterLat ?? 52.12,
      lon: panel.tileCenterLon ?? 5.28,
    };
    setTargetZoom(defaultZoom);
    setRenderZoom(defaultZoom);
    setCenter(defaultCenter);
    tileMapViewStateByPanelId.set(panel.id, {
      zoom: defaultZoom,
      center: defaultCenter,
    });
  }

  function stopMapControlEvent(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleWheel(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handlePointerDown(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startCenterPixel: centerPixel,
    };
  }

  function handlePointerMove(event) {
    event.preventDefault();
    event.stopPropagation();
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const nextPixel = {
      x: drag.startCenterPixel.x - (event.clientX - drag.startX),
      y: drag.startCenterPixel.y - (event.clientY - drag.startY),
    };
    setCenter(globalPixelToLonLat(nextPixel.x, nextPixel.y, zoom));
  }

  function endDrag(event) {
    event.preventDefault();
    event.stopPropagation();
    if (dragState.current?.pointerId === event.pointerId) {
      dragState.current = null;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  }

  return (
    <div
      ref={mapRef}
      className="tile-map-panel"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onWheel={handleWheel}
      onDragStart={(event) => event.preventDefault()}
      style={{ "--map-width": `${width}px`, "--map-height": `${height}px` }}
    >
      <div className="tile-map-tiles" aria-hidden="true">
        {tiles.map((tile) => (
          <img
            key={`${tile.z}-${tile.x}-${tile.y}`}
            src={`https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`}
            alt=""
            crossOrigin="anonymous"
            draggable="false"
            style={{
              left: `${tile.left}px`,
              top: `${tile.top}px`,
              width: `${tile.size}px`,
              height: `${tile.size}px`,
            }}
          />
        ))}
      </div>
      <div className="tile-map-title">{panel.title}</div>
      <svg
        className="tile-map-overlay"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={panel.title}
      >
        <g className="tile-map-boundaries" transform={`translate(${boundaryOffsetX} ${boundaryOffsetY})`}>
          {geoJsonPaths(geoData, project).map((path, index) => (
            <path key={`${panel.id}-boundary-${index}`} d={path} />
          ))}
        </g>
        <g className="tile-map-points">
          {data.map((row) => {
            const point = project(Number(row[panel.lonField]), Number(row[panel.latField]));
            const value = Number(row[panel.valueField] ?? 0);
            const radius = (10 + (value / maxValue) * 24) * (panel.pointScale ?? 1);
            return (
              <g key={`${panel.id}-${row[panel.nameField]}`} className="tile-map-point">
                <circle cx={point.x} cy={point.y} r={radius} />
                <title>{`${row[panel.nameField]}: ${formatValue(value)}`}</title>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="tile-map-controls" aria-label="Map controls">
        <button type="button" onPointerDown={stopMapControlEvent} onClick={(event) => { stopMapControlEvent(event); zoomBy(0.5); }}>
          +
        </button>
        <button type="button" onPointerDown={stopMapControlEvent} onClick={(event) => { stopMapControlEvent(event); zoomBy(-0.5); }}>
          -
        </button>
        <button type="button" title="Reset map view" onPointerDown={stopMapControlEvent} onClick={(event) => { stopMapControlEvent(event); resetMapView(); }}>
          R
        </button>
      </div>
      <div className="tile-map-credit">OpenStreetMap</div>
    </div>
  );
}
function useElementDimensions(ref) {
  const [dimensions, setDimensions] = React.useState({ width: 0, height: 0 });

  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return undefined;
    }

    function measure() {
      const rect = element.getBoundingClientRect();
      setDimensions({ width: Math.round(rect.width), height: Math.round(rect.height) });
    }

    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(element);
    window.addEventListener("resize", measure);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ref]);

  return dimensions;
}

function areChartPanelPropsEqual(previous, next) {
  return (
    previous.panel === next.panel &&
    previous.globalPanelColors === next.globalPanelColors &&
    previous.data === next.data &&
    previous.geoData === next.geoData &&
    previous.filterDefinitions === next.filterDefinitions &&
    previous.filterValues === next.filterValues &&
    previous.editMode === next.editMode &&
    previous.isDragging === next.isDragging &&
    previous.isDragTarget === next.isDragTarget &&
    previous.isSelected === next.isSelected &&
    previous.multiSelectMode === next.multiSelectMode &&
    previous.isMultiSelected === next.isMultiSelected
  );
}

export default React.memo(ChartPanel, areChartPanelPropsEqual);

function KpiPanel({ panel, data }) {
  const cards = panel.items ?? Object.entries(data[0] ?? {}).map(([label, value]) => ({ label, value }));
  const layout = panel.kpiLayout ?? {};
  const columns = clamp(Number(layout.columns) || Math.max(1, cards.length), 1, 12);
  const rows = clamp(Number(layout.rows) || 1, 1, 12);
  return (
    <div className="kpi-panel-content">
      <h3>{panel.title}</h3>
      <div
        className="kpi-grid"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
      >
        {cards.map((item, index) => {
          const columnSpan = clamp(Number(item.columnSpan) || 1, 1, columns);
          const rowSpan = clamp(Number(item.rowSpan) || 1, 1, rows);
          return (
            <div className="kpi-card" key={`${item.label}-${index}`} style={{ gridColumn: `span ${columnSpan}`, gridRow: `span ${rowSpan}` }}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TablePanel({ panel, data }) {
  const columns = panel.columns ?? Object.keys(data[0] ?? {});
  return (
    <div className="table-panel-content">
      <h3>{panel.title}</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr key={`${panel.id}-${rowIndex}`}>
                {columns.map((column) => (
                  <td key={column}>{formatValue(row[column])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DeltaListPanel({ panel, data }) {
  const fields = panel.fields ?? {};
  const sortedRows = [...data].sort((a, b) => {
    const direction = panel.sortDirection === "asc" ? 1 : -1;
    const field = panel.sortBy ?? fields.value;
    return direction * (Number(a[field] ?? 0) - Number(b[field] ?? 0));
  });
  const rows = sortedRows.slice(0, panel.rowLimit ?? 12);

  return (
    <div className="delta-panel-content">
      <h3>{panel.title}</h3>
      <div className="delta-grid">
        {rows.map((row, index) => {
          const rawValue = Number(row[fields.value] ?? 0);
          const displayValue = `${rawValue >= 0 && panel.valuePrefix ? panel.valuePrefix : ""}${formatValue(rawValue)}`;
          return (
            <div className="delta-card" key={`${panel.id}-${index}`}>
              <span>{row[fields.title]}</span>
              <strong className={rawValue >= 0 ? "delta-positive" : "delta-negative"}>
                {displayValue}
              </strong>
              {fields.detail && <small>{formatValue(row[fields.detail])}</small>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function applyPanelFilters(data, panel, filters, filterDefinitions, filterValues) {
  if (!Array.isArray(data)) {
    return data;
  }

  const dateScopedRows = panel.dataBinding ? data : applyPanelDateSelection(data, panel);

  return filters.reduce((rows, filter) => {
    if (filter.equals !== undefined) {
      if (panel.dataBinding) return rows;
      return rows.filter((row) => String(row[filter.column]) === String(filter.equals));
    }
    if (Array.isArray(filter.in)) {
      if (panel.dataBinding) return rows;
      const allowed = new Set(filter.in.map(String));
      return rows.filter((row) => allowed.has(String(row[filter.column])));
    }
    if (!filter.filterId) {
      return rows;
    }

    const definition = filterDefinitions.find((item) => item.id === filter.filterId);
    const value = filterValues[filter.filterId];
    if (!definition || value === undefined || value === null) {
      return rows;
    }

    const filterColumn = filter.column ?? definition.column;
    if (definition.type === "dateRange" || isDateLikeColumn(filterColumn)) {
      return rows;
    }

    return rows.filter((row) => String(row[filterColumn]) === String(value));
  }, dateScopedRows);
}

function ImagePanel({ panel, fullScreen = false }) {
  const zoom = Number(panel.imageZoom ?? 1);
  const positionX = Number(panel.imagePositionX ?? 50);
  const positionY = Number(panel.imagePositionY ?? 50);
  return (
    <div className={fullScreen ? "image-panel-content image-panel-fullscreen" : "image-panel-content"}>
      <h3>{panel.title}</h3>
      {panel.imageSrc ? (
        <div className="image-panel-frame">
          <img
            src={panel.imageSrc}
            alt={panel.imageAlt ?? panel.title ?? "Dashboard image"}
            style={{
              objectFit: panel.imageFit ?? "contain",
              objectPosition: `${positionX}% ${positionY}%`,
              transform: `scale(${zoom})`,
              transformOrigin: `${positionX}% ${positionY}%`,
            }}
          />
        </div>
      ) : (
        <p>No image uploaded yet.</p>
      )}
    </div>
  );
}

function applyPanelDateSelection(data, panel) {
  const selection = panel.dateSelection;
  if (!selection?.column) {
    return data;
  }

  if (selection.mode === "single") {
    return data.filter((row) => String(row[selection.column] ?? "") === String(selection.value ?? ""));
  }

  if (selection.mode === "range") {
    const start = String(selection.start ?? "");
    const end = String(selection.end ?? "");
    if (!start || !end) {
      return data;
    }
    return data.filter((row) => {
      const value = String(row[selection.column] ?? "");
      return compareDateishValues(value, start) >= 0 && compareDateishValues(value, end) <= 0;
    });
  }

  if (Array.isArray(selection.values)) {
    const allowed = new Set(selection.values.map(String));
    return data.filter((row) => allowed.has(String(row[selection.column])));
  }

  return data;
}

function isDateLikeColumn(column) {
  const normalized = String(column ?? "").toLowerCase();
  return normalized.includes("date") || normalized.includes("datum") || normalized.includes("snapshot");
}

function compareDateishValues(a, b) {
  const dateA = Date.parse(a);
  const dateB = Date.parse(b);
  if (!Number.isNaN(dateA) && !Number.isNaN(dateB)) {
    return dateA - dateB;
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function formatValue(value) {
  if (typeof value === "number") {
    return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }
  return value ?? "";
}

function uniqueSortedDates(data, column) {
  return [...new Set((data ?? []).map((row) => row?.[column]).filter(Boolean))]
    .sort(compareDateishValues);
}

function groupRowsByValue(rows, column) {
  const groups = new Map();
  for (const row of rows ?? []) {
    const key = String(row?.[column] ?? "");
    if (!key) {
      continue;
    }
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(row);
  }
  return groups;
}

async function exportPanelImage({ panel, chartRef, container, format = "png", dpi = 150 }) {
  const type = format === "jpeg" ? "jpeg" : "png";
  const pixelRatio = Math.max(1, Number(dpi) / 96);
  const fileName = `${slugify(panel.title || panel.id || "chart")}-${dpi}dpi.${type === "jpeg" ? "jpg" : "png"}`;
  const backgroundColor = type === "jpeg" ? "#ffffff" : panel.chartAreaColor ?? "#ffffff";

  try {
    const echartsInstance = chartRef.current?.getEchartsInstance?.();
    if (echartsInstance) {
      const url = echartsInstance.getDataURL({
        type,
        pixelRatio,
        backgroundColor,
      });
      downloadDataUrl(url, fileName);
      return;
    }

    if (panel.type === "mapScatter") {
      const url = await exportMapToDataUrl(container, type, pixelRatio, backgroundColor);
      downloadDataUrl(url, fileName);
      return;
    }

    if (panel.type === "image") {
      const url = await exportImagePanelToDataUrl(container, type, pixelRatio, backgroundColor);
      downloadDataUrl(url, fileName);
      return;
    }

    const url = await exportSimplePanelToDataUrl(container, panel, type, pixelRatio, backgroundColor);
    downloadDataUrl(url, fileName);
  } catch (error) {
    window.alert(`Could not export this panel: ${error.message}`);
  }
}

async function exportMapToDataUrl(container, type, pixelRatio, backgroundColor) {
  const mapElement = container?.querySelector?.(".tile-map-panel");
  if (!mapElement) {
    throw new Error("Map panel is not available yet.");
  }
  const rect = mapElement.getBoundingClientRect();
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(rect.width * pixelRatio);
  canvas.height = Math.round(rect.height * pixelRatio);
  const context = canvas.getContext("2d");
  context.scale(pixelRatio, pixelRatio);
  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, rect.width, rect.height);

  const tiles = [...mapElement.querySelectorAll(".tile-map-tiles img")];
  await Promise.all(tiles.map(waitForImage));
  tiles.forEach((tile) => {
    const left = parseFloat(tile.style.left) || 0;
    const top = parseFloat(tile.style.top) || 0;
    const width = parseFloat(tile.style.width) || tile.naturalWidth;
    const height = parseFloat(tile.style.height) || tile.naturalHeight;
    context.drawImage(tile, left, top, width, height);
  });

  const overlay = mapElement.querySelector(".tile-map-overlay");
  if (overlay) {
    const overlayImage = await svgElementToImage(overlay);
    context.drawImage(overlayImage, 0, 0, rect.width, rect.height);
  }

  const title = mapElement.querySelector(".tile-map-title")?.textContent;
  if (title) {
    context.fillStyle = "#08224a";
    context.font = "700 16px Inter, Arial, sans-serif";
    context.fillText(title, 16, 28);
  }
  return canvas.toDataURL(`image/${type}`, type === "jpeg" ? 0.92 : undefined);
}

async function exportImagePanelToDataUrl(container, type, pixelRatio, backgroundColor) {
  const image = container?.querySelector?.(".image-panel-frame img");
  if (!image) {
    throw new Error("No image is loaded in this panel.");
  }
  await waitForImage(image);
  const rect = container.getBoundingClientRect();
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(rect.width * pixelRatio);
  canvas.height = Math.round(rect.height * pixelRatio);
  const context = canvas.getContext("2d");
  context.scale(pixelRatio, pixelRatio);
  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, rect.width, rect.height);
  context.drawImage(image, 0, 0, rect.width, rect.height);
  return canvas.toDataURL(`image/${type}`, type === "jpeg" ? 0.92 : undefined);
}

async function exportSimplePanelToDataUrl(container, panel, type, pixelRatio, backgroundColor) {
  const rect = container?.getBoundingClientRect?.();
  if (!rect) {
    throw new Error("Panel is not available yet.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(rect.width * pixelRatio);
  canvas.height = Math.round(rect.height * pixelRatio);
  const context = canvas.getContext("2d");
  context.scale(pixelRatio, pixelRatio);
  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, rect.width, rect.height);
  context.fillStyle = "#08224a";
  context.font = "700 18px Inter, Arial, sans-serif";
  context.fillText(panel.title ?? "Dashboard panel", 20, 34);
  context.font = "13px Inter, Arial, sans-serif";
  context.fillText("Static panel export placeholder. Use browser print/export for full table or KPI content.", 20, 60);
  return canvas.toDataURL(`image/${type}`, type === "jpeg" ? 0.92 : undefined);
}

function svgElementToImage(svgElement) {
  return new Promise((resolve, reject) => {
    const clone = svgElement.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const source = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not render map overlay for export."));
    };
    image.src = url;
  });
}

function waitForImage(image) {
  if (image.complete && image.naturalWidth > 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", () => reject(new Error("Could not load an image used by this panel.")), { once: true });
  });
}

function downloadDataUrl(url, fileName) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "chart";
}

function resolvePanelColors(panel, globalPanelColors) {
  if (panel.useGlobalPanelColors === false) {
    return {
      ...panel,
      editHighlightColor: globalPanelColors?.editHighlightColor ?? panel.editHighlightColor,
      multiSelectHighlightColor: globalPanelColors?.multiSelectHighlightColor ?? panel.multiSelectHighlightColor,
    };
  }
  return {
    ...panel,
    panelBackgroundColor: globalPanelColors?.panelBackgroundColor ?? panel.panelBackgroundColor,
    panelBorderColor: globalPanelColors?.panelBorderColor ?? panel.panelBorderColor,
    chartAreaColor: globalPanelColors?.chartAreaColor ?? panel.chartAreaColor,
    chartAreaBorderColor: globalPanelColors?.chartAreaBorderColor ?? panel.chartAreaBorderColor,
    editHighlightColor: globalPanelColors?.editHighlightColor ?? panel.editHighlightColor,
    multiSelectHighlightColor: globalPanelColors?.multiSelectHighlightColor ?? panel.multiSelectHighlightColor,
  };
}

function lonLatToGlobalPixel(lon, lat, zoom) {
  const tileSize = 256;
  const scale = tileSize * 2 ** zoom;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
}

function globalPixelToLonLat(x, y, zoom) {
  const tileSize = 256;
  const scale = tileSize * 2 ** zoom;
  const lon = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lon, lat };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function visibleTiles(origin, width, height, zoom, tileZoom = Math.floor(zoom), tileScale = 1) {
  const tileSize = 256;
  const scaledTileSize = tileSize * tileScale;
  const tileOrigin = {
    x: origin.x / tileScale,
    y: origin.y / tileScale,
  };
  const maxTile = 2 ** tileZoom;
  const minX = Math.floor(tileOrigin.x / tileSize);
  const maxX = Math.floor((tileOrigin.x + width / tileScale) / tileSize);
  const minY = Math.floor(tileOrigin.y / tileSize);
  const maxY = Math.floor((tileOrigin.y + height / tileScale) / tileSize);
  const tiles = [];

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      if (y < 0 || y >= maxTile) {
        continue;
      }
      const wrappedX = ((x % maxTile) + maxTile) % maxTile;
      tiles.push({
        x: wrappedX,
        y,
        z: tileZoom,
        left: (x * tileSize - tileOrigin.x) * tileScale,
        top: (y * tileSize - tileOrigin.y) * tileScale,
        size: scaledTileSize,
      });
    }
  }

  return tiles;
}


function geoJsonPaths(geoData, project) {
  if (!geoData?.features) {
    return [];
  }

  return geoData.features.flatMap((feature) => geometryPaths(feature.geometry, project));
}

function geometryPaths(geometry, project) {
  if (!geometry) {
    return [];
  }
  if (geometry.type === "Polygon") {
    return [polygonPath(geometry.coordinates, project)];
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.map((polygon) => polygonPath(polygon, project));
  }
  return [];
}

function polygonPath(rings, project) {
  return rings
    .map((ring) =>
      `${ring
        .map(([lon, lat], index) => {
          const point = project(Number(lon), Number(lat));
          return `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
        })
        .join(" ")} Z`,
    )
    .join(" ");
}

function normalizePanelSize(size) {
  return size === "standard" || !size ? "normal" : size;
}

function sourceNoteForPanel(panel) {
  return panel.infoSource || `Source: ${panel.dataSource ?? "dashboard configuration"}`;
}

function chartRenderContext(panel, fullScreen, dimensions, multiFullScreen = false) {
  const panelSize = normalizePanelSize(panel.size);
  const fallbackHeight = fullScreen ? 760 : panelSize === "tall" || panelSize === "large" ? 744 : 380;
  const fallbackWidth = fullScreen ? 1180 : panelSize === "half" ? 320 : panelSize === "wide" || panelSize === "large" ? 1040 : 520;
  const height = dimensions.height || fallbackHeight;
  const width = dimensions.width || fallbackWidth;
  const heightScale = height / 380;
  const widthScale = width / 520;
  const compact = fullScreen && width <= 720;
  const contextScale = multiFullScreen
    ? Math.max(0.95, Math.min(1.7, 1 + (heightScale - 1) * 0.32 + (widthScale - 1) * 0.12))
    : fullScreen
    ? compact
      ? Math.max(1, Math.min(1.3, 1 + (heightScale - 1) * 0.15 + (widthScale - 1) * 0.1))
      : Math.max(1.8, Math.min(2.65, 1 + (heightScale - 1) * 0.62 + (widthScale - 1) * 0.22))
    : Math.max(0.94, Math.min(1.65, 1 + (heightScale - 1) * 0.36 + (widthScale - 1) * 0.12));

  return {
    fullScreen,
    height,
    width,
    heightScale,
    widthScale,
    compact,
    panelSize,
    scale: contextScale,
  };
}





