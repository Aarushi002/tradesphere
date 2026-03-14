// frontend/src/components/PriceChart.js
import React, { useEffect, useRef } from 'react';
import * as LightweightCharts from 'lightweight-charts';

const PriceChart = ({ data }) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const el = chartContainerRef.current;
    // Create chart instance (use container dimensions for responsive height)
    chartRef.current = LightweightCharts.createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight || 300,
      layout: {
        background: { color: '#111827' },
        textColor: '#e5e7eb',
      },
      grid: {
        vertLines: { color: '#1f2933' },
        horzLines: { color: '#1f2933' },
      },
      rightPriceScale: {
        borderColor: '#374151',
      },
      timeScale: {
        borderColor: '#374151',
      },
    });

    // Candlestick series (for OHLC data) - v5 API
    seriesRef.current = chartRef.current.addSeries(
      LightweightCharts.CandlestickSeries,
      {
        upColor: '#16a34a',
        downColor: '#dc2626',
        borderUpColor: '#16a34a',
        borderDownColor: '#dc2626',
        wickUpColor: '#16a34a',
        wickDownColor: '#dc2626',
      }
    );

    // Resize chart on container resize
    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        const c = chartContainerRef.current;
        chartRef.current.applyOptions({
          width: c.clientWidth,
          height: c.clientHeight || 300,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
      }
    };
  }, []);

  // Whenever data changes, update the series and fit view to remove empty space
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current || !data || data.length === 0) return;
    seriesRef.current.setData(data);
    // Fit time scale to the actual data range so no empty space on left/right
    requestAnimationFrame(() => {
      if (chartRef.current) {
        try {
          chartRef.current.timeScale().fitContent();
        } catch (_) {}
      }
    });
  }, [data]);

  return (
    <div
      ref={chartContainerRef}
      className="w-full h-full min-h-[200px]"
    />
  );
};

export default PriceChart;