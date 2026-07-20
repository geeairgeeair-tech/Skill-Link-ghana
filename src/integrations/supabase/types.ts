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
          address: string | null
          category_id: string | null
          created_at: string
          customer_id: string
          description: string
          estimated_cost: number | null
          id: string
          photos: Json
          scheduled_at: string | null
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
          worker_id: string
        }
        Insert: {
          address?: string | null
          category_id?: string | null
          created_at?: string
          customer_id: string
          description?: string
          estimated_cost?: number | null
          id?: string
          photos?: Json
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
          worker_id: string
        }
        Update: {
          address?: string | null
          category_id?: string | null
          created_at?: string
          customer_id?: string
          description?: string
          estimated_cost?: number | null
          id?: string
          photos?: Json
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
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
        ]
      }
      job_requests: {
        Row: {
          address: string | null
          budget: number | null
          category_id: string | null
          city: string | null
          created_at: string
          customer_id: string
          description: string
          id: string
          lat: number | null
          lng: number | null
          media: Json
          preferred_at: string | null
          service_area: string | null
          status: Database["public"]["Enums"]["job_request_status"]
          title: string
          updated_at: string
          urgency: Database["public"]["Enums"]["job_urgency"]
        }
        Insert: {
          address?: string | null
          budget?: number | null
          category_id?: string | null
          city?: string | null
          created_at?: string
          customer_id: string
          description: string
          id?: string
          lat?: number | null
          lng?: number | null
          media?: Json
          preferred_at?: string | null
          service_area?: string | null
          status?: Database["public"]["Enums"]["job_request_status"]
          title: string
          updated_at?: string
          urgency?: Database["public"]["Enums"]["job_urgency"]
        }
        Update: {
          address?: string | null
          budget?: number | null
          category_id?: string | null
          city?: string | null
          created_at?: string
          customer_id?: string
          description?: string
          id?: string
          lat?: number | null
          lng?: number | null
          media?: Json
          preferred_at?: string | null
          service_area?: string | null
          status?: Database["public"]["Enums"]["job_request_status"]
          title?: string
          updated_at?: string
          urgency?: Database["public"]["Enums"]["job_urgency"]
        }
        Relationships: [
          {
            foreignKeyName: "job_requests_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
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
        }
        Insert: {
          booking_id?: string | null
          comment?: string | null
          created_at?: string
          customer_id: string
          id?: string
          rating: number
          worker_id: string
        }
        Update: {
          booking_id?: string | null
          comment?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          rating?: number
          worker_id?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
      verification_status: "pending" | "approved" | "rejected"
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
      verification_status: ["pending", "approved", "rejected"],
    },
  },
} as const
