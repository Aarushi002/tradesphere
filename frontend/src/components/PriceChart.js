// frontend/src/components/PriceChart.js
import React, { useEffect, useRef } from 'react';
import * as LightweightCharts from 'lightweight-charts';

const PriceChart = ({ data, darkMode = true, lastPrice }) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const lineSeriesRef = useRef(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const el = chartContainerRef.current;
    const isDark = !!darkMode;
    chartRef.current = LightweightCharts.createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight || 300,
      layout: {
        background: { color: isDark ? '#111827' : '#ffffff' },
        textColor: isDark ? '#e5e7eb' : '#374151',
      },
      grid: {
        vertLines: { color: isDark ? '#1f2933' : '#e5e7eb' },
        horzLines: { color: isDark ? '#1f2933' : '#e5e7eb' },
      },
      rightPriceScale: {
        borderColor: isDark ? '#374151' : '#d1d5db',
      },
      timeScale: {
        borderColor: isDark ? '#374151' : '#d1d5db',
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

    // Line series for real-time LTP (optional)
    lineSeriesRef.current = chartRef.current.addSeries(LightweightCharts.LineSeries, {
      color: '#f59e0b',
      lineWidth: 2,
      priceLineVisible: true,
      lastValueVisible: true,
    });

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
      lineSeriesRef.current = null;
    };
  }, [darkMode]);

  // Whenever data or theme changes, update candlestick series and fit view
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current || !data || data.length === 0) return;
    seriesRef.current.setData(data);
    requestAnimationFrame(() => {
      if (chartRef.current) {
        try {
          chartRef.current.timeScale().fitContent();
        } catch (_) {}
      }
    });
  }, [data, darkMode]);

  // Real-time LTP line: only when lastPrice is provided (full-screen live chart)
  useEffect(() => {
    if (!lineSeriesRef.current || !chartRef.current || !data || data.length === 0) return;
    if (typeof lastPrice === 'number' && !Number.isNaN(lastPrice)) {
      const lineData = data.map((c) => ({ time: c.time, value: c.close }));
      lineData[lineData.length - 1] = { time: data[data.length - 1].time, value: lastPrice };
      lineSeriesRef.current.setData(lineData);
    } else {
      lineSeriesRef.current.setData([]);
    }
  }, [data, lastPrice]);

  return (
    <div
      ref={chartContainerRef}
      className="w-full h-full min-h-[200px]"
    />
  );
};

export default PriceChart;