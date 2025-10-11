// API service for loan application operations
export interface LoanApplication {
  id: string;
  applicationId?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  requestedAmount: number;
  termMonths: number;
  purpose: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  submittedAt: string;
  reviewedAt?: string;
  approvedAmount?: number;
  rejectionReason?: string;
  borrower?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
    phone: string;
    nationalId?: string;
  };
}

export interface ApplicationApprovalRequest {
  approvedAmount?: number;
  interestRate?: number;
  termMonths?: number;
}

export interface ApplicationRejectionRequest {
  rejectionReason: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

class ApplicationService {
  private baseURL = 'http://localhost:3002/api';

  /**
   * Fetch all loan applications
   */
  async getAllApplications(): Promise<ApiResponse<LoanApplication[]>> {
    try {
      const response = await fetch(`${this.baseURL}/applications`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const applications = await response.json();
      return { data: applications };
    } catch (error) {
      console.error('Error fetching applications:', error);
      return { 
        error: error instanceof Error ? error.message : 'Failed to fetch applications' 
      };
    }
  }

  /**
   * Fetch only pending loan applications
   */
  async getPendingApplications(): Promise<ApiResponse<LoanApplication[]>> {
    try {
      const response = await fetch(`${this.baseURL}/applications/pending`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        return { data: result.data };
      } else {
        throw new Error(result.message || 'Failed to fetch pending applications');
      }
    } catch (error) {
      console.error('Error fetching pending applications:', error);
      return { 
        error: error instanceof Error ? error.message : 'Failed to fetch pending applications' 
      };
    }
  }

  /**
   * Approve a loan application
   */
  async approveApplication(
    applicationId: string, 
    approvalData: ApplicationApprovalRequest = {}
  ): Promise<ApiResponse<any>> {
    try {
      const response = await fetch(`${this.baseURL}/applications/${applicationId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(approvalData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return { data: result, message: result.message };
    } catch (error) {
      console.error('Error approving application:', error);
      return { 
        error: error instanceof Error ? error.message : 'Failed to approve application' 
      };
    }
  }

  /**
   * Reject a loan application
   */
  async rejectApplication(
    applicationId: string, 
    rejectionData: ApplicationRejectionRequest
  ): Promise<ApiResponse<any>> {
    try {
      const response = await fetch(`${this.baseURL}/applications/${applicationId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(rejectionData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return { data: result, message: result.message };
    } catch (error) {
      console.error('Error rejecting application:', error);
      return { 
        error: error instanceof Error ? error.message : 'Failed to reject application' 
      };
    }
  }

  /**
   * Approve multiple applications in bulk
   */
  async bulkApproveApplications(
    applicationIds: string[],
    approvedAmount?: number
  ): Promise<ApiResponse<{ successful: Array<{applicationId: string; loanId: string}>; failed: Array<{applicationId: string; error: string}> }>> {
    try {
      const response = await fetch(`${this.baseURL}/applications/bulk-approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          applicationIds,
          approvedAmount
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        return { 
          data: result.data,
          message: result.message
        };
      } else {
        throw new Error(result.message || 'Failed to bulk approve applications');
      }
    } catch (error) {
      console.error('Error in bulk approval:', error);
      return {
        error: error instanceof Error ? error.message : 'Failed to process bulk approval'
      };
    }
  }

  /**
   * Calculate automatic eligibility status based on credit score and other factors
   * This is a client-side helper function to categorize applications
   */
  getApplicationStatus(application: LoanApplication): 'auto-eligible' | 'review-required' | 'high-risk' {
    // Since we don't have credit score in our current schema, we'll use amount and other factors
    const { requestedAmount, termMonths } = application;
    
    // Simple eligibility rules (you can customize these)
    if (requestedAmount <= 10000 && termMonths <= 12) {
      return 'auto-eligible';
    } else if (requestedAmount <= 25000 && termMonths <= 24) {
      return 'review-required';
    } else {
      return 'high-risk';
    }
  }
}

// Export a singleton instance
export const applicationService = new ApplicationService();
export default applicationService;