export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_logs: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          details: Json | null
          id: string
          target_type: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          details?: Json | null
          id?: string
          target_type?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_type?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      bookings: {
        Row: {
          accepted_at: string | null
          address: string | null
          admin_resolution_note: string | null
          admin_resolved_at: string | null
          admin_review_requested_at: string | null
          amount_paid: number | null
          arrived_at: string | null
          budget: number | null
          category_id: string | null
          completion_note: string | null
          created_at: string
          customer_confirmed_at: string | null
          customer_id: string
          decline_note: string | null
          decline_reason: string | null
          declined_at: string | null
          description: string
          dispute_details: string | null
          dispute_reason: string | null
          disputed_at: string | null
          estimated_amount: number | null
          estimated_cost: number | null
          final_amount: number | null
          id: string
          job_application_id: string | null
          last_reminder_at: string | null
          latitude: number | null
          longitude: number | null
          on_the_way_at: string | null
          payment_confirmed_at: string | null
          payment_status: string
          photos: Json
          reminder_count: number | null
          scheduled_at: string | null
          service_area: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
          urgency: string
          worker_completed_at: string | null
          worker_id: string
        }
        Insert: {
          accepted_at?: string | null
          address?: string | null
          admin_resolution_note?: string | null
          admin_resolved_at?: string | null
          admin_review_requested_at?: string | null
          amount_paid?: number | null
          arrived_at?: string | null
          budget?: number | null
          category_id?: string | null
          completion_note?: string | null
          created_at?: string
          customer_confirmed_at?: string | null
          customer_id: string
          decline_note?: string | null
          decline_reason?: string | null
          declined_at?: string | null
          description?: string
          dispute_details?: string | null
          dispute_reason?: string | null
          disputed_at?: string | null
          estimated_amount?: number | null
          estimated_cost?: number | null
          final_amount?: number | null
          id?: string
          job_application_id?: string | null
          last_reminder_at?: string | null
          latitude?: number | null
          longitude?: number | null
          on_the_way_at?: string | null
          payment_confirmed_at?: string | null
          payment_status?: string
          photos?: Json
          reminder_count?: number | null
          scheduled_at?: string | null
          service_area?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
          urgency?: string
          worker_completed_at?: string | null
          worker_id: string
        }
        Update: {
          accepted_at?: string | null
          address?: string | null
          admin_resolution_note?: string | null
          admin_resolved_at?: string | null
          admin_review_requested_at?: string | null
          amount_paid?: number | null
          arrived_at?: string | null
          budget?: number | null
          category_id?: string | null
          completion_note?: string | null
          created_at?: string
          customer_confirmed_at?: string | null
          customer_id?: string
          decline_note?: string | null
          decline_reason?: string | null
          declined_at?: string | null
          description?: string
          dispute_details?: string | null
          dispute_reason?: string | null
          disputed_at?: string | null
          estimated_amount?: number | null
          estimated_cost?: number | null
          final_amount?: number | null
          id?: string
          job_application_id?: string | null
          last_reminder_at?: string | null
          latitude?: number | null
          longitude?: number | null
          on_the_way_at?: string | null
          payment_confirmed_at?: string | null
          payment_status?: string
          photos?: Json
          reminder_count?: number | null
          scheduled_at?: string | null
          service_area?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
          urgency?: string
          worker_completed_at?: string | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_job_application_id_fkey"
            columns: ["job_application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          active: boolean
          icon: string
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          icon: string
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          icon?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      job_applications: {
        Row: {
          created_at: string
          estimated_start: string | null
          id: string
          job_id: string
          message: string | null
          quoted_price: number
          status: Database["public"]["Enums"]["job_application_status"]
          updated_at: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          estimated_start?: string | null
          id?: string
          job_id: string
          message?: string | null
          quoted_price: number
          status?: Database["public"]["Enums"]["job_application_status"]
          updated_at?: string
          worker_id: string
        }
        Update: {
          created_at?: string
          estimated_start?: string | null
          id?: string
          job_id?: string
          message?: string | null
          quoted_price?: number
          status?: Database["public"]["Enums"]["job_application_status"]
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_requests: {
        Row: {
          address: string | null
          area: string | null
          assigned_worker_id: string | null
          booking_id: string | null
          budget: number | null
          cancel_reason: string | null
          cancelled_at: string | null
          category_id: string | null
          city: string | null
          created_at: string
          customer_id: string
          description: string
          id: string
          landmark: string | null
          lat: number | null
          lng: number | null
          location_instructions: string | null
          media: Json
          preferred_at: string | null
          region: string | null
          service_area: string | null
          status: Database["public"]["Enums"]["job_request_status"]
          title: string
          updated_at: string
          urgency: Database["public"]["Enums"]["job_urgency"]
        }
        Insert: {
          address?: string | null
          area?: string | null
          assigned_worker_id?: string | null
          booking_id?: string | null
          budget?: number | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          category_id?: string | null
          city?: string | null
          created_at?: string
          customer_id: string
          description: string
          id?: string
          landmark?: string | null
          lat?: number | null
          lng?: number | null
          location_instructions?: string | null
          media?: Json
          preferred_at?: string | null
          region?: string | null
          service_area?: string | null
          status?: Database["public"]["Enums"]["job_request_status"]
          title: string
          updated_at?: string
          urgency?: Database["public"]["Enums"]["job_urgency"]
        }
        Update: {
          address?: string | null
          area?: string | null
          assigned_worker_id?: string | null
          booking_id?: string | null
          budget?: number | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          category_id?: string | null
          city?: string | null
          created_at?: string
          customer_id?: string
          description?: string
          id?: string
          landmark?: string | null
          lat?: number | null
          lng?: number | null
          location_instructions?: string | null
          media?: Json
          preferred_at?: string | null
          region?: string | null
          service_area?: string | null
          status?: Database["public"]["Enums"]["job_request_status"]
          title?: string
          updated_at?: string
          urgency?: Database["public"]["Enums"]["job_urgency"]
        }
        Relationships: [
          {
            foreignKeyName: "job_requests_assigned_worker_id_fkey"
            columns: ["assigned_worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_requests_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          booking_id: string
          content: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          booking_id: string
          content: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          booking_id?: string
          content?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json
          id: string
          read_at: string | null
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          city: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          full_name?: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          booking_id: string | null
          comment: string | null
          created_at: string
          customer_id: string
          id: string
          rating: number
          worker_id: string
          would_hire_again: boolean | null
        }
        Insert: {
          booking_id?: string | null
          comment?: string | null
          created_at?: string
          customer_id: string
          id?: string
          rating: number
          worker_id: string
          would_hire_again?: boolean | null
        }
        Update: {
          booking_id?: string | null
          comment?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          rating?: number
          worker_id?: string
          would_hire_again?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          admin_id: string | null
          admin_response: string | null
          attachment_url: string | null
          category: string
          created_at: string
          id: string
          message: string
          related_worker_id: string | null
          responded_at: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_id?: string | null
          admin_response?: string | null
          attachment_url?: string | null
          category?: string
          created_at?: string
          id?: string
          message: string
          related_worker_id?: string | null
          responded_at?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_id?: string | null
          admin_response?: string | null
          attachment_url?: string | null
          category?: string
          created_at?: string
          id?: string
          message?: string
          related_worker_id?: string | null
          responded_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      worker_portfolio: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string
          sort_order: number
          title: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url: string
          sort_order?: number
          title: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string
          sort_order?: number
          title?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_portfolio_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "worker_portfolio_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      worker_profiles: {
        Row: {
          bio: string | null
          callout_fee: number | null
          category_id: string | null
          city: string | null
          created_at: string
          date_of_birth: string | null
          ghana_card_number: string | null
          ghana_card_url: string | null
          hourly_rate: number | null
          is_available: boolean
          is_featured: boolean | null
          jobs_completed: number | null
          phone_verified: boolean | null
          portfolio_images: Json
          rating: number | null
          rejected_at: string | null
          rejection_reason: string | null
          reviews_count: number | null
          selfie_url: string | null
          service_area: string | null
          starting_price: number | null
          subscription_expires_at: string | null
          subscription_plan:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          unavailable_note: string | null
          updated_at: string
          user_id: string
          verification_status: Database["public"]["Enums"]["verification_status"]
          years_experience: number | null
        }
        Insert: {
          bio?: string | null
          callout_fee?: number | null
          category_id?: string | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          ghana_card_number?: string | null
          ghana_card_url?: string | null
          hourly_rate?: number | null
          is_available?: boolean
          is_featured?: boolean | null
          jobs_completed?: number | null
          phone_verified?: boolean | null
          portfolio_images?: Json
          rating?: number | null
          rejected_at?: string | null
          rejection_reason?: string | null
          reviews_count?: number | null
          selfie_url?: string | null
          service_area?: string | null
          starting_price?: number | null
          subscription_expires_at?: string | null
          subscription_plan?:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          unavailable_note?: string | null
          updated_at?: string
          user_id: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
          years_experience?: number | null
        }
        Update: {
          bio?: string | null
          callout_fee?: number | null
          category_id?: string | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          ghana_card_number?: string | null
          ghana_card_url?: string | null
          hourly_rate?: number | null
          is_available?: boolean
          is_featured?: boolean | null
          jobs_completed?: number | null
          phone_verified?: boolean | null
          portfolio_images?: Json
          rating?: number | null
          rejected_at?: string | null
          rejection_reason?: string | null
          reviews_count?: number | null
          selfie_url?: string | null
          service_area?: string | null
          starting_price?: number | null
          subscription_expires_at?: string | null
          subscription_plan?:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          unavailable_note?: string | null
          updated_at?: string
          user_id?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_profiles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      workers_public: {
        Row: {
          bio: string | null
          callout_fee: number | null
          category_id: string | null
          city: string | null
          created_at: string | null
          hourly_rate: number | null
          is_available: boolean | null
          is_featured: boolean | null
          jobs_completed: number | null
          portfolio_images: Json | null
          rating: number | null
          reviews_count: number | null
          service_area: string | null
          starting_price: number | null
          subscription_expires_at: string | null
          unavailable_note: string | null
          updated_at: string | null
          user_id: string | null
          verification_status:
            | Database["public"]["Enums"]["verification_status"]
            | null
          years_experience: number | null
        }
        Insert: {
          bio?: string | null
          callout_fee?: number | null
          category_id?: string | null
          city?: string | null
          created_at?: string | null
          hourly_rate?: number | null
          is_available?: boolean | null
          is_featured?: boolean | null
          jobs_completed?: number | null
          portfolio_images?: Json | null
          rating?: number | null
          reviews_count?: number | null
          service_area?: string | null
          starting_price?: number | null
          subscription_expires_at?: string | null
          unavailable_note?: string | null
          updated_at?: string | null
          user_id?: string | null
          verification_status?:
            | Database["public"]["Enums"]["verification_status"]
            | null
          years_experience?: number | null
        }
        Update: {
          bio?: string | null
          callout_fee?: number | null
          category_id?: string | null
          city?: string | null
          created_at?: string | null
          hourly_rate?: number | null
          is_available?: boolean | null
          is_featured?: boolean | null
          jobs_completed?: number | null
          portfolio_images?: Json | null
          rating?: number | null
          reviews_count?: number | null
          service_area?: string | null
          starting_price?: number | null
          subscription_expires_at?: string | null
          unavailable_note?: string | null
          updated_at?: string | null
          user_id?: string | null
          verification_status?:
            | Database["public"]["Enums"]["verification_status"]
            | null
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_profiles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_get_user_detail: {
        Args: { _user_id: string }
        Returns: {
          address: string
          age: number
          applications_count: number
          avatar_url: string
          bio: string
          bookings_as_customer_count: number
          bookings_as_worker_count: number
          category_name: string
          city: string
          created_at: string
          date_of_birth: string
          email: string
          full_name: string
          ghana_card_number: string
          ghana_card_url: string
          is_available: boolean
          is_suspended: boolean
          is_worker: boolean
          jobs_completed: number
          jobs_posted_count: number
          last_sign_in_at: string
          phone: string
          rating: number
          rejected_at: string
          rejection_reason: string
          reviews_count: number
          reviews_received_count: number
          reviews_written_count: number
          roles: string[]
          selfie_url: string
          service_area: string
          user_id: string
          verification_status: string
          years_experience: number
        }[]
      }
      admin_list_users: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          is_suspended: boolean
          phone: string
          roles: string[]
          user_id: string
          verification_status: string
        }[]
      }
      admin_list_workers: {
        Args: { _status?: string }
        Returns: {
          age: number
          avatar_url: string
          category_name: string
          city: string
          created_at: string
          date_of_birth: string
          email: string
          full_name: string
          is_available: boolean
          jobs_completed: number
          phone: string
          rating: number
          reviews_count: number
          service_area: string
          subscription_expires_at: string
          user_id: string
          verification_status: string
          years_experience: number
        }[]
      }
      admin_reject_worker: {
        Args: { _reason: string; _user_id: string }
        Returns: undefined
      }
      admin_reply_support_ticket: {
        Args: { _new_status?: string; _reply: string; _ticket_id: string }
        Returns: undefined
      }
      admin_resolve_dispute: {
        Args: { _action: string; _booking_id: string; _note?: string }
        Returns: undefined
      }
      customer_accept_job_application: {
        Args: { _application_id: string }
        Returns: string
      }
      customer_cancel_job_request: {
        Args: { _job_id: string; _reason: string }
        Returns: undefined
      }
      customer_confirm_booking_completion: {
        Args: {
          _amount_note?: string
          _amount_paid: number
          _booking_id: string
          _rating: number
          _review_text?: string
          _would_hire_again?: boolean
        }
        Returns: undefined
      }
      customer_dispute_booking: {
        Args: { _booking_id: string; _details: string; _reason_code: string }
        Returns: undefined
      }
      customer_update_job_request: {
        Args: {
          _address: string
          _area: string
          _budget: number
          _category_id: string
          _city: string
          _description: string
          _job_id: string
          _landmark: string
          _location_instructions: string
          _preferred_at: string
          _region: string
          _service_area: string
          _title: string
          _urgency: string
        }
        Returns: undefined
      }
      get_job_request_address: { Args: { _id: string }; Returns: string }
      get_profile_contact: {
        Args: { _id: string }
        Returns: {
          address: string
          phone: string
        }[]
      }
      get_user_email: { Args: { _user_id: string }; Returns: string }
      get_worker_identity: {
        Args: { _user_id: string }
        Returns: {
          date_of_birth: string
          ghana_card_number: string
          ghana_card_url: string
          selfie_url: string
        }[]
      }
      get_worker_public_status: {
        Args: { _worker_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      send_awaiting_confirmation_reminders: { Args: never; Returns: number }
      submit_support_ticket: {
        Args: {
          _attachment_url?: string
          _category: string
          _contact_email?: string
          _message: string
          _subject: string
        }
        Returns: string
      }
      worker_accept_booking: {
        Args: { _booking_id: string }
        Returns: undefined
      }
      worker_apply_to_job: {
        Args: {
          _estimated_start: string
          _job_id: string
          _message?: string
          _note?: string
          _proposed_amount: number
        }
        Returns: string
      }
      worker_decline_booking: {
        Args: {
          _booking_id: string
          _reason_code: string
          _reason_note?: string
        }
        Returns: undefined
      }
      worker_mark_arrived: { Args: { _booking_id: string }; Returns: undefined }
      worker_mark_booking_completed: {
        Args: {
          _booking_id: string
          _completion_note?: string
          _final_amount: number
        }
        Returns: undefined
      }
      worker_mark_on_the_way: {
        Args: { _booking_id: string }
        Returns: undefined
      }
      worker_request_admin_review: {
        Args: { _booking_id: string }
        Returns: undefined
      }
      worker_resubmit_verification: { Args: never; Returns: undefined }
      worker_start_booking: {
        Args: { _booking_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "customer" | "worker" | "admin"
      booking_status:
        | "pending"
        | "accepted"
        | "on_the_way"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "declined"
        | "arrived"
        | "worker_on_the_way"
        | "work_started"
        | "worker_marked_complete"
        | "customer_confirmed_complete"
        | "closed"
        | "disputed"
        | "no_show"
        | "awaiting_customer_confirmation"
      job_application_status: "pending" | "withdrawn" | "accepted" | "rejected"
      job_request_status:
        | "open"
        | "assigned"
        | "closed"
        | "cancelled"
        | "draft"
        | "in_progress"
        | "completed"
      job_urgency: "normal" | "urgent" | "emergency"
      subscription_plan: "basic" | "premium" | "elite"
      verification_status: "pending" | "approved" | "rejected" | "suspended"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["customer", "worker", "admin"],
      booking_status: [
        "pending",
        "accepted",
        "on_the_way",
        "in_progress",
        "completed",
        "cancelled",
        "declined",
        "arrived",
        "worker_on_the_way",
        "work_started",
        "worker_marked_complete",
        "customer_confirmed_complete",
        "closed",
        "disputed",
        "no_show",
        "awaiting_customer_confirmation",
      ],
      job_application_status: ["pending", "withdrawn", "accepted", "rejected"],
      job_request_status: [
        "open",
        "assigned",
        "closed",
        "cancelled",
        "draft",
        "in_progress",
        "completed",
      ],
      job_urgency: ["normal", "urgent", "emergency"],
      subscription_plan: ["basic", "premium", "elite"],
      verification_status: ["pending", "approved", "rejected", "suspended"],
    },
  },
} as const
