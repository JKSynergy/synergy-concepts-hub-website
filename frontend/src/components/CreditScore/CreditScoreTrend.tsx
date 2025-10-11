import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { CreditScoreHistory } from '../../services/aiCreditService';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface CreditScoreTrendProps {
  history: CreditScoreHistory[];
  height?: number;
}

const CreditScoreTrend: React.FC<CreditScoreTrendProps> = ({ history, height = 200 }) => {
  const data = {
    labels: history.map(h => new Date(h.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })),
    datasets: [
      {
        label: 'Credit Score',
        data: history.map(h => h.score),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: 'rgb(59, 130, 246)',
        pointBorderColor: 'white',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: 'white',
        bodyColor: 'white',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 1,
        callbacks: {
          label: (context: any) => {
            const score = context.parsed.y;
            let grade = 'Poor';
            if (score >= 750) grade = 'Excellent';
            else if (score >= 650) grade = 'Good';
            else if (score >= 550) grade = 'Fair';
            
            return [`Score: ${score}`, `Grade: ${grade}`];
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          color: 'rgb(156, 163, 175)'
        }
      },
      y: {
        min: 300,
        max: 850,
        grid: {
          color: 'rgba(156, 163, 175, 0.1)'
        },
        ticks: {
          color: 'rgb(156, 163, 175)',
          stepSize: 100
        }
      }
    },
    elements: {
      point: {
        hoverBackgroundColor: 'rgb(59, 130, 246)'
      }
    }
  };

  return (
    <div style={{ height: `${height}px` }}>
      <Line data={data} options={options} />
    </div>
  );
};

export default CreditScoreTrend;