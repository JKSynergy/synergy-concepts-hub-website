import React from 'react';
import { useParams } from 'react-router-dom';

const LoanDetails: React.FC = () => {
  const { loanId } = useParams<{ loanId: string }>();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">
        Loan Details {loanId}
      </h1>
      <div className="card">
        <p>Detailed loan information will be implemented here.</p>
      </div>
    </div>
  );
};

export default LoanDetails;