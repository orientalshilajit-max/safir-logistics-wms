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
