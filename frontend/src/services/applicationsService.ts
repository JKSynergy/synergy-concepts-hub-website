import { apiService } from './apiService';
import { API_ENDPOINTS } from '../config/api';

export interface Borrower {
  id: string;
  borrowerId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  gender?: string;
  dateOfBirth?: string;
  nationalId: string;
  district?: string;
  subcounty?: string;
  village?: string;
  occupation: string;
  monthlyIncome?: number;
  creditRating: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdById: string;
}

export interface Application {
  id: string;
  applicationId: string;
  borrowerId: string;
  requestedAmount: number;
  purpose: string;
  termMonths: number;
  status: 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
  submittedAt: string;
  reviewedAt?: string;
  reviewedById?: string;
  approvedAmount?: number;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
  borrower: Borrower;
  
  // Legacy fields for backward compatibility
  fullName?: string;
  dob?: string;
  nationalId?: string;
  phone?: string;
  email?: string;
  address?: string;
  employmentStatus?: string;
  employer?: string;
  monthlyIncome?: string;
  loanTerm?: number;
  collateral?: string;
  guarantorName?: string;
  guarantorId?: string;
  guarantorPhone?: string;
  guarantorRelation?: string;
  submissionDate?: string;
  reviewDate?: string;
  reviewedBy?: string;
  reviewNotes?: string;
}

export interface ApplicationsResponse {
  success: boolean;
  data: Application[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  message: string;
}

export interface ApplicationResponse {
  success: boolean;
  data: Application;
  message: string;
}

export interface CreateApplicationRequest {
  fullName: string;
  dob?: string;
  nationalId?: string;
  phone: string;
  email?: string;
  address?: string;
  employmentStatus: string;
  employer: string;
  monthlyIncome: string;
  requestedAmount: number;
  loanTerm: number;
  purpose: string;
  collateral?: string;
  guarantorName?: string;
  guarantorId?: string;
  guarantorPhone?: string;
  guarantorRelation?: string;
}

export interface UpdateApplicationRequest extends Partial<CreateApplicationRequest> {
  id: string;
}

export interface ApplicationFilters {
  status?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

class ApplicationsService {
  // Get all applications with filtering and pagination
  async getApplications(
    filters: ApplicationFilters = {},
    pagination: PaginationParams = {}
  ): Promise<ApplicationsResponse> {
    try {
      const params = new URLSearchParams();
      
      // Add pagination parameters
      if (pagination.page) params.append('page', pagination.page.toString());
      if (pagination.limit) params.append('limit', pagination.limit.toString());
      
      // Add filter parameters
      if (filters.status && filters.status !== 'All') {
        params.append('status', filters.status.toLowerCase());
      }
      if (filters.search) params.append('search', filters.search);
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);
      if (filters.amountMin) params.append('amountMin', filters.amountMin.toString());
      if (filters.amountMax) params.append('amountMax', filters.amountMax.toString());
      
      const queryString = params.toString();
      const url = `${API_ENDPOINTS.APPLICATIONS}${queryString ? `?${queryString}` : ''}`;
      
      const response = await apiService.get<any>(url);
      
      // Handle both formats: the expected format and the simple array format
      if (Array.isArray(response)) {
        // Simple backend returns array directly
        const applications = response.map((app: any) => ({
          id: app.id,
          applicationId: app.applicationId,
          borrowerId: app.borrowerId,
          requestedAmount: app.requestedAmount || 0,
          purpose: app.purpose || 'Not specified',
          termMonths: app.loanTermMonths || app.termMonths || 12,
          status: app.status as 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED',
          submittedAt: app.submittedAt || app.createdAt || new Date().toISOString(),
          reviewedAt: app.reviewedAt,
          reviewedById: app.reviewedBy,
          approvedAmount: app.approvedAmount,
          rejectionReason: app.rejectionReason,
          createdAt: app.createdAt,
          updatedAt: app.updatedAt,
          borrower: app.borrower || {
            id: app.borrowerId || '',
            borrowerId: app.borrowerId || '',
            firstName: app.borrower?.firstName || '',
            lastName: app.borrower?.lastName || '',
            phone: app.borrower?.phone || app.phone || '',
            email: app.borrower?.email || app.email || '',
            nationalId: app.borrower?.nationalId || app.nationalId || '',
            occupation: app.borrower?.occupation || app.employmentStatus || 'Unknown',
            creditRating: app.borrower?.creditRating || 'Not rated',
            status: app.borrower?.status || 'ACTIVE',
            createdAt: app.borrower?.createdAt || app.createdAt || '',
            updatedAt: app.borrower?.updatedAt || app.updatedAt || '',
            createdById: app.borrower?.createdById || '',
            dateOfBirth: app.borrower?.dateOfBirth || app.dateOfBirth,
            gender: app.borrower?.gender,
            district: app.borrower?.district,
            subcounty: app.borrower?.subcounty,
            village: app.borrower?.village,
            monthlyIncome: app.borrower?.monthlyIncome || app.monthlyIncome
          },
          // Legacy fields for backward compatibility
          fullName: app.fullName || (app.borrower?.firstName && app.borrower?.lastName ? `${app.borrower.firstName} ${app.borrower.lastName}` : 'Unknown'),
          dob: app.dateOfBirth || app.borrower?.dateOfBirth,
          nationalId: app.nationalId || app.borrower?.nationalId,
          phone: app.phone || app.borrower?.phone || '',
          email: app.email || app.borrower?.email,
          address: app.address,
          employmentStatus: app.employmentStatus || app.borrower?.occupation || 'Unknown',
          employer: app.employer || 'Unknown',
          monthlyIncome: app.monthlyIncome || app.borrower?.monthlyIncome || 'Not provided',
          loanTerm: app.loanTermMonths || app.termMonths || 12,
          collateral: app.collateral,
          guarantorName: app.guarantorName,
          guarantorId: app.guarantorId,
          guarantorPhone: app.guarantorPhone,
          guarantorRelation: app.guarantorRelation,
          submissionDate: app.submittedAt || app.createdAt || new Date().toISOString(),
          reviewDate: app.reviewedAt,
          reviewedBy: app.reviewedBy,
          reviewNotes: app.reviewNotes,
        }));

        // Apply client-side filtering if needed
        let filteredApps = applications;
        if (filters.search) {
          const searchLower = filters.search.toLowerCase();
          filteredApps = applications.filter(app => 
            app.fullName.toLowerCase().includes(searchLower) ||
            app.purpose.toLowerCase().includes(searchLower) ||
            (app.id && app.id.toString().toLowerCase().includes(searchLower))
          );
        }
        if (filters.status && filters.status !== 'All') {
          filteredApps = filteredApps.filter(app => app.status === filters.status?.toLowerCase());
        }

        // Apply client-side pagination
        const page = pagination.page || 1;
        const limit = pagination.limit || 12;
        const startIndex = (page - 1) * limit;
        const paginatedApps = filteredApps.slice(startIndex, startIndex + limit);

        return {
          success: true,
          data: paginatedApps,
          total: filteredApps.length,
          page: page,
          limit: limit,
          totalPages: Math.ceil(filteredApps.length / limit),
          message: 'Applications retrieved successfully'
        };
      } else if (response.success) {
        // Expected format
        return response;
      } else {
        throw new Error(response.message || 'Failed to fetch applications');
      }
    } catch (error: any) {
      console.error('Error fetching applications:', error);
      
      // Return empty response structure when API fails
      return {
        success: true,
        data: [],
        total: 0,
        page: pagination.page || 1,
        limit: pagination.limit || 12,
        totalPages: 0,
        message: 'No applications found'
      };
    }
  }

  // Get application by ID
  async getApplicationById(id: string): Promise<ApplicationResponse> {
    try {
      const response = await apiService.get<ApplicationResponse>(
        API_ENDPOINTS.APPLICATION_BY_ID(id)
      );
      return response;
    } catch (error) {
      console.error('Error fetching application:', error);
      throw new Error('Failed to fetch application');
    }
  }

  // Create new application
  async createApplication(application: CreateApplicationRequest): Promise<ApplicationResponse> {
    try {
      const response = await apiService.post<ApplicationResponse>(
        API_ENDPOINTS.APPLICATIONS,
        application
      );
      return response;
    } catch (error) {
      console.error('Error creating application:', error);
      throw new Error('Failed to create application');
    }
  }

  // Update application
  async updateApplication(
    id: string,
    updates: Partial<CreateApplicationRequest>
  ): Promise<ApplicationResponse> {
    try {
      const response = await apiService.put<ApplicationResponse>(
        API_ENDPOINTS.APPLICATION_BY_ID(id),
        updates
      );
      return response;
    } catch (error) {
      console.error('Error updating application:', error);
      throw new Error('Failed to update application');
    }
  }

  // Delete application
  async deleteApplication(id: string): Promise<{ message: string; applicationId: string }> {
    try {
      const response = await apiService.delete<{ message: string; applicationId: string }>(
        API_ENDPOINTS.APPLICATION_BY_ID(id)
      );
      return response;
    } catch (error) {
      console.error('Error deleting application:', error);
      throw new Error('Failed to delete application');
    }
  }

  // Approve application
  async approveApplication(
    id: string,
    reviewNotes?: string
  ): Promise<ApplicationResponse> {
    try {
      const response = await apiService.post<ApplicationResponse>(
        API_ENDPOINTS.APPROVE_APPLICATION(id),
        { reviewNotes }
      );
      return response;
    } catch (error) {
      console.error('Error approving application:', error);
      throw new Error('Failed to approve application');
    }
  }

  // Reject application
  async rejectApplication(
    id: string,
    reviewNotes: string
  ): Promise<ApplicationResponse> {
    try {
      const response = await apiService.post<ApplicationResponse>(
        API_ENDPOINTS.REJECT_APPLICATION(id),
        { reviewNotes }
      );
      return response;
    } catch (error) {
      console.error('Error rejecting application:', error);
      throw new Error('Failed to reject application');
    }
  }

  // Get application statistics
  async getApplicationStats(): Promise<{
    total: number;
    pending: number;
    underReview: number;
    approved: number;
    rejected: number;
    totalAmount: number;
    averageAmount: number;
  }> {
    try {
      const response = await apiService.get<{
        total: number;
        pending: number;
        underReview: number;
        approved: number;
        rejected: number;
        totalAmount: number;
        averageAmount: number;
      }>(`${API_ENDPOINTS.APPLICATION_STATS}`);
      
      return response;
    } catch (error) {
      console.error('Error fetching application stats:', error);
      // Return default stats if API fails
      return {
        total: 0,
        pending: 0,
        underReview: 0,
        approved: 0,
        rejected: 0,
        totalAmount: 0,
        averageAmount: 0,
      };
    }
  }

  // Export applications
  async exportApplications(
    filters: ApplicationFilters = {},
    format: 'csv' | 'excel' = 'csv'
  ): Promise<Blob> {
    try {
      const params = new URLSearchParams();
      params.append('format', format);
      
      // Add filter parameters
      if (filters.status && filters.status !== 'All') {
        params.append('status', filters.status.toLowerCase());
      }
      if (filters.search) params.append('search', filters.search);
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);
      if (filters.amountMin) params.append('amountMin', filters.amountMin.toString());
      if (filters.amountMax) params.append('amountMax', filters.amountMax.toString());
      
      const response = await apiService.get<Blob>(
        `${API_ENDPOINTS.APPLICATIONS}/export?${params.toString()}`,
        { responseType: 'blob' }
      );
      
      return response;
    } catch (error) {
      console.error('Error exporting applications:', error);
      throw new Error('Failed to export applications');
    }
  }

  // Bulk operations
  async bulkUpdateApplications(
    ids: string[],
    updates: Partial<CreateApplicationRequest>
  ): Promise<{ success: boolean; message: string; updated: number }> {
    try {
      const response = await apiService.patch<{
        success: boolean;
        message: string;
        updated: number;
      }>(`${API_ENDPOINTS.APPLICATIONS}/bulk`, {
        ids,
        updates,
      });
      
      return response;
    } catch (error) {
      console.error('Error bulk updating applications:', error);
      throw new Error('Failed to bulk update applications');
    }
  }

  async bulkDeleteApplications(ids: string[]): Promise<{
    success: boolean;
    message: string;
    deleted: number;
  }> {
    try {
      const response = await apiService.delete<{
        success: boolean;
        message: string;
        deleted: number;
      }>(`${API_ENDPOINTS.APPLICATIONS}/bulk`, {
        data: { ids },
      });
      
      return response;
    } catch (error) {
      console.error('Error bulk deleting applications:', error);
      throw new Error('Failed to bulk delete applications');
    }
  }
}

export const applicationsService = new ApplicationsService();
export default applicationsService;