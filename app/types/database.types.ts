export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string;
          client_id: string | null;
          created_at: string;
          deleted_at: string | null;
          entity_id: string;
          entity_type: string;
          id: string;
          metadata: Json;
          updated_at: string;
          user_type: string;
        };
        Insert: {
          action: string;
          client_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          entity_id: string;
          entity_type: string;
          id?: string;
          metadata?: Json;
          updated_at?: string;
          user_type: string;
        };
        Update: {
          action?: string;
          client_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          metadata?: Json;
          updated_at?: string;
          user_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activity_logs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      attachments: {
        Row: {
          client_id: string | null;
          created_at: string;
          deleted_at: string | null;
          entity_id: string;
          entity_type: string;
          file_name: string;
          file_url: string;
          id: string;
          note: string | null;
          updated_at: string;
          uploaded_by: string;
        };
        Insert: {
          client_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          entity_id: string;
          entity_type: string;
          file_name: string;
          file_url: string;
          id?: string;
          note?: string | null;
          updated_at?: string;
          uploaded_by: string;
        };
        Update: {
          client_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          entity_id?: string;
          entity_type?: string;
          file_name?: string;
          file_url?: string;
          id?: string;
          note?: string | null;
          updated_at?: string;
          uploaded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attachments_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
        Row: {
          company_name: string;
          contact_name: string;
          created_at: string;
          deleted_at: string | null;
          email: string;
          id: string;
          notes: string | null;
          phone: string | null;
          status: string;
          telegram: string | null;
          updated_at: string;
        };
        Insert: {
          company_name: string;
          contact_name: string;
          created_at?: string;
          deleted_at?: string | null;
          email: string;
          id?: string;
          notes?: string | null;
          phone?: string | null;
          status?: string;
          telegram?: string | null;
          updated_at?: string;
        };
        Update: {
          company_name?: string;
          contact_name?: string;
          created_at?: string;
          deleted_at?: string | null;
          email?: string;
          id?: string;
          notes?: string | null;
          phone?: string | null;
          status?: string;
          telegram?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      client_pricing_overrides: {
        Row: {
          active: boolean;
          client_id: string;
          created_at: string;
          deleted_at: string | null;
          id: string;
          notes: string | null;
          override_price: number;
          service_id: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          client_id: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          notes?: string | null;
          override_price: number;
          service_id: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          client_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          notes?: string | null;
          override_price?: number;
          service_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "client_pricing_overrides_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "client_pricing_overrides_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
        ];
      };
      incoming_items: {
        Row: {
          created_at: string;
          damaged_quantity: number;
          deleted_at: string | null;
          expected_quantity: number;
          id: string;
          inventory_posted_at: string | null;
          missing_quantity: number;
          notes: string | null;
          product_id: string;
          received_quantity: number;
          shipment_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          damaged_quantity?: number;
          deleted_at?: string | null;
          expected_quantity: number;
          id?: string;
          inventory_posted_at?: string | null;
          missing_quantity?: number;
          notes?: string | null;
          product_id: string;
          received_quantity?: number;
          shipment_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          damaged_quantity?: number;
          deleted_at?: string | null;
          expected_quantity?: number;
          id?: string;
          inventory_posted_at?: string | null;
          missing_quantity?: number;
          notes?: string | null;
          product_id?: string;
          received_quantity?: number;
          shipment_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "incoming_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incoming_items_shipment_id_fkey";
            columns: ["shipment_id"];
            isOneToOne: false;
            referencedRelation: "incoming_shipments";
            referencedColumns: ["id"];
          },
        ];
      };
      incoming_shipments: {
        Row: {
          carrier: string;
          client_id: string;
          created_at: string;
          deleted_at: string | null;
          expected_arrival_date: string | null;
          id: string;
          notes: string | null;
          number_of_boxes: number;
          status_id: string;
          tracking_numbers: string[];
          updated_at: string;
        };
        Insert: {
          carrier: string;
          client_id: string;
          created_at?: string;
          deleted_at?: string | null;
          expected_arrival_date?: string | null;
          id?: string;
          notes?: string | null;
          number_of_boxes?: number;
          status_id: string;
          tracking_numbers?: string[];
          updated_at?: string;
        };
        Update: {
          carrier?: string;
          client_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          expected_arrival_date?: string | null;
          id?: string;
          notes?: string | null;
          number_of_boxes?: number;
          status_id?: string;
          tracking_numbers?: string[];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "incoming_shipments_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incoming_shipments_status_id_fkey";
            columns: ["status_id"];
            isOneToOne: false;
            referencedRelation: "statuses";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory: {
        Row: {
          available_qty: number;
          client_id: string;
          created_at: string;
          damaged_qty: number;
          deleted_at: string | null;
          expected_qty: number;
          id: string;
          processing_qty: number;
          product_id: string;
          received_qty: number;
          reserved_qty: number;
          shipped_qty: number;
          updated_at: string;
        };
        Insert: {
          available_qty?: number;
          client_id: string;
          created_at?: string;
          damaged_qty?: number;
          deleted_at?: string | null;
          expected_qty?: number;
          id?: string;
          processing_qty?: number;
          product_id: string;
          received_qty?: number;
          reserved_qty?: number;
          shipped_qty?: number;
          updated_at?: string;
        };
        Update: {
          available_qty?: number;
          client_id?: string;
          created_at?: string;
          damaged_qty?: number;
          deleted_at?: string | null;
          expected_qty?: number;
          id?: string;
          processing_qty?: number;
          product_id?: string;
          received_qty?: number;
          reserved_qty?: number;
          shipped_qty?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          active: boolean;
          asin: string | null;
          client_id: string;
          created_at: string;
          deleted_at: string | null;
          fnsku: string | null;
          id: string;
          notes: string | null;
          photo_url: string | null;
          product_name: string;
          sku: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          asin?: string | null;
          client_id: string;
          created_at?: string;
          deleted_at?: string | null;
          fnsku?: string | null;
          id?: string;
          notes?: string | null;
          photo_url?: string | null;
          product_name: string;
          sku?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          asin?: string | null;
          client_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          fnsku?: string | null;
          id?: string;
          notes?: string | null;
          photo_url?: string | null;
          product_name?: string;
          sku?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      request_box_items: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          id: string;
          product_id: string;
          quantity: number;
          request_box_id: string;
          request_item_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          product_id: string;
          quantity: number;
          request_box_id: string;
          request_item_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          product_id?: string;
          quantity?: number;
          request_box_id?: string;
          request_item_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "request_box_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "request_box_items_request_box_id_fkey";
            columns: ["request_box_id"];
            isOneToOne: false;
            referencedRelation: "request_boxes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "request_box_items_request_item_id_fkey";
            columns: ["request_item_id"];
            isOneToOne: false;
            referencedRelation: "request_items";
            referencedColumns: ["id"];
          },
        ];
      };
      request_boxes: {
        Row: {
          box_number: number;
          created_at: string;
          deleted_at: string | null;
          id: string;
          request_id: string;
          tracking_number: string | null;
          updated_at: string;
          uploaded_label_url: string | null;
        };
        Insert: {
          box_number: number;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          request_id: string;
          tracking_number?: string | null;
          updated_at?: string;
          uploaded_label_url?: string | null;
        };
        Update: {
          box_number?: number;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          request_id?: string;
          tracking_number?: string | null;
          updated_at?: string;
          uploaded_label_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "request_boxes_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "service_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      request_item_services: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          estimated_total: number;
          id: string;
          pricing_type: string;
          quantity_basis: number;
          request_item_id: string;
          service_id: string;
          unit_price: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          estimated_total?: number;
          id?: string;
          pricing_type: string;
          quantity_basis?: number;
          request_item_id: string;
          service_id: string;
          unit_price: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          estimated_total?: number;
          id?: string;
          pricing_type?: string;
          quantity_basis?: number;
          request_item_id?: string;
          service_id?: string;
          unit_price?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "request_item_services_request_item_id_fkey";
            columns: ["request_item_id"];
            isOneToOne: false;
            referencedRelation: "request_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "request_item_services_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
        ];
      };
      request_items: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          fnsku: string | null;
          id: string;
          inventory_id: string;
          notes: string | null;
          product_id: string;
          requested_quantity: number;
          request_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          fnsku?: string | null;
          id?: string;
          inventory_id: string;
          notes?: string | null;
          product_id: string;
          requested_quantity: number;
          request_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          fnsku?: string | null;
          id?: string;
          inventory_id?: string;
          notes?: string | null;
          product_id?: string;
          requested_quantity?: number;
          request_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "request_items_inventory_id_fkey";
            columns: ["inventory_id"];
            isOneToOne: false;
            referencedRelation: "inventory";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "request_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "request_items_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "service_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      service_requests: {
        Row: {
          admin_notes: string | null;
          approved_at: string | null;
          box_count: number;
          carrier: string | null;
          client_id: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          estimated_total: number;
          id: string;
          notes: string | null;
          rejected_at: string | null;
          request_number: string;
          shipping_label_urls: string[];
          status:
            | "Draft"
            | "Submitted"
            | "Pending Approval"
            | "Approved"
            | "Rejected"
            | "Waiting Labels"
            | "Ready for Prep"
            | "Prep in Progress"
            | "QC Check"
            | "Packing"
            | "Ready to Ship"
            | "Shipped"
            | "Completed"
            | "On Hold"
            | "Need Client Action";
          submitted_at: string | null;
          tracking_numbers: string[];
          updated_at: string;
        };
        Insert: {
          admin_notes?: string | null;
          approved_at?: string | null;
          box_count?: number;
          carrier?: string | null;
          client_id: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          estimated_total?: number;
          id?: string;
          notes?: string | null;
          rejected_at?: string | null;
          request_number?: string;
          shipping_label_urls?: string[];
          status?:
            | "Draft"
            | "Submitted"
            | "Pending Approval"
            | "Approved"
            | "Rejected"
            | "Waiting Labels"
            | "Ready for Prep"
            | "Prep in Progress"
            | "QC Check"
            | "Packing"
            | "Ready to Ship"
            | "Shipped"
            | "Completed"
            | "On Hold"
            | "Need Client Action";
          submitted_at?: string | null;
          tracking_numbers?: string[];
          updated_at?: string;
        };
        Update: {
          admin_notes?: string | null;
          approved_at?: string | null;
          box_count?: number;
          carrier?: string | null;
          client_id?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          estimated_total?: number;
          id?: string;
          notes?: string | null;
          rejected_at?: string | null;
          request_number?: string;
          shipping_label_urls?: string[];
          status?:
            | "Draft"
            | "Submitted"
            | "Pending Approval"
            | "Approved"
            | "Rejected"
            | "Waiting Labels"
            | "Ready for Prep"
            | "Prep in Progress"
            | "QC Check"
            | "Packing"
            | "Ready to Ship"
            | "Shipped"
            | "Completed"
            | "On Hold"
            | "Need Client Action";
          submitted_at?: string | null;
          tracking_numbers?: string[];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_requests_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      services: {
        Row: {
          active: boolean;
          category: string;
          created_at: string;
          default_price: number;
          deleted_at: string | null;
          description: string | null;
          id: string;
          name: string;
          pricing_type:
            | "per_unit"
            | "per_box"
            | "per_shipment"
            | "per_pallet"
            | "per_order"
            | "per_month"
            | "manual";
          updated_at: string;
          visible_to_client: boolean;
        };
        Insert: {
          active?: boolean;
          category: string;
          created_at?: string;
          default_price?: number;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          pricing_type:
            | "per_unit"
            | "per_box"
            | "per_shipment"
            | "per_pallet"
            | "per_order"
            | "per_month"
            | "manual";
          updated_at?: string;
          visible_to_client?: boolean;
        };
        Update: {
          active?: boolean;
          category?: string;
          created_at?: string;
          default_price?: number;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          pricing_type?:
            | "per_unit"
            | "per_box"
            | "per_shipment"
            | "per_pallet"
            | "per_order"
            | "per_month"
            | "manual";
          updated_at?: string;
          visible_to_client?: boolean;
        };
        Relationships: [];
      };
      statuses: {
        Row: {
          active: boolean;
          category: string;
          color: string;
          created_at: string;
          deleted_at: string | null;
          id: string;
          is_public: boolean;
          name: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          category: string;
          color?: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          is_public?: boolean;
          name: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          category?: string;
          color?: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          is_public?: boolean;
          name?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      current_client_id: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      is_wms_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      submit_service_request: {
        Args: { p_request_id: string };
        Returns: undefined;
      };
      set_updated_at: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (Database["public"]["Tables"] & Database["public"]["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (Database["public"]["Tables"] &
        Database["public"]["Views"])
    ? (Database["public"]["Tables"] &
        Database["public"]["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;
