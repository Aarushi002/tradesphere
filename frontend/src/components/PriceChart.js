// frontend/src/components/PriceChart.js
import React, { useEffect, useRef } from 'react';
import * as LightweightCharts from 'lightweight-charts';

const PriceChart = ({ data }) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart instance
    chartRef.current = LightweightCharts.createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 400,
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
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
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

  // Whenever data changes, update the series
  useEffect(() => {
    if (!seriesRef.current || !data || data.length === 0) return;
    seriesRef.current.setData(data);
  }, [data]);

  return (
    <div
      ref={chartContainerRef}
      style={{ width: '100%', height: '400px' }}
    />
  );
};

export default PriceChart;