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
          archived_at: string | null;
          category:
            | "Agreement"
            | "Product Images"
            | "Supplier Invoice"
            | "Compliance"
            | "General"
            | "Other";
          client_id: string | null;
          created_at: string;
          deleted_at: string | null;
          entity_id: string;
          entity_type: string;
          file_name: string;
          file_scope: "global" | "client_specific";
          file_url: string;
          id: string;
          invoice_id: string | null;
          mime_type: string | null;
          note: string | null;
          product_id: string | null;
          service_request_id: string | null;
          shipment_id: string | null;
          storage_path: string | null;
          updated_at: string;
          uploaded_by: string;
          uploaded_by_role: "admin" | "client" | "warehouse_operator" | "system";
          uploaded_by_user_id: string | null;
          visible_to_client: boolean;
        };
        Insert: {
          archived_at?: string | null;
          category?:
            | "Agreement"
            | "Product Images"
            | "Supplier Invoice"
            | "Compliance"
            | "General"
            | "Other";
          client_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          entity_id: string;
          entity_type: string;
          file_name: string;
          file_scope?: "global" | "client_specific";
          file_url: string;
          id?: string;
          invoice_id?: string | null;
          mime_type?: string | null;
          note?: string | null;
          product_id?: string | null;
          service_request_id?: string | null;
          shipment_id?: string | null;
          storage_path?: string | null;
          updated_at?: string;
          uploaded_by: string;
          uploaded_by_role?: "admin" | "client" | "warehouse_operator" | "system";
          uploaded_by_user_id?: string | null;
          visible_to_client?: boolean;
        };
        Update: {
          archived_at?: string | null;
          category?:
            | "Agreement"
            | "Product Images"
            | "Supplier Invoice"
            | "Compliance"
            | "General"
            | "Other";
          client_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          entity_id?: string;
          entity_type?: string;
          file_name?: string;
          file_scope?: "global" | "client_specific";
          file_url?: string;
          id?: string;
          invoice_id?: string | null;
          mime_type?: string | null;
          note?: string | null;
          product_id?: string | null;
          service_request_id?: string | null;
          shipment_id?: string | null;
          storage_path?: string | null;
          updated_at?: string;
          uploaded_by?: string;
          uploaded_by_role?: "admin" | "client" | "warehouse_operator" | "system";
          uploaded_by_user_id?: string | null;
          visible_to_client?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "attachments_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attachments_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attachments_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attachments_service_request_id_fkey";
            columns: ["service_request_id"];
            isOneToOne: false;
            referencedRelation: "service_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attachments_shipment_id_fkey";
            columns: ["shipment_id"];
            isOneToOne: false;
            referencedRelation: "incoming_shipments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attachments_uploaded_by_user_id_fkey";
            columns: ["uploaded_by_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
        Row: {
          auth_user_id: string | null;
          company_name: string;
          contact_name: string;
          created_at: string;
          deleted_at: string | null;
          email: string;
          id: string;
          login_status: "no login" | "invited" | "active";
          notes: string | null;
          phone: string | null;
          status: string;
          telegram: string | null;
          updated_at: string;
        };
        Insert: {
          auth_user_id?: string | null;
          company_name: string;
          contact_name: string;
          created_at?: string;
          deleted_at?: string | null;
          email: string;
          id?: string;
          login_status?: "no login" | "invited" | "active";
          notes?: string | null;
          phone?: string | null;
          status?: string;
          telegram?: string | null;
          updated_at?: string;
        };
        Update: {
          auth_user_id?: string | null;
          company_name?: string;
          contact_name?: string;
          created_at?: string;
          deleted_at?: string | null;
          email?: string;
          id?: string;
          login_status?: "no login" | "invited" | "active";
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
          is_unexpected: boolean;
          missing_quantity: number;
          notes: string | null;
          product_id: string;
          received_quantity: number;
          shipment_id: string;
          tracking_box_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          damaged_quantity?: number;
          deleted_at?: string | null;
          expected_quantity: number;
          id?: string;
          inventory_posted_at?: string | null;
          is_unexpected?: boolean;
          missing_quantity?: number;
          notes?: string | null;
          product_id: string;
          received_quantity?: number;
          shipment_id: string;
          tracking_box_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          damaged_quantity?: number;
          deleted_at?: string | null;
          expected_quantity?: number;
          id?: string;
          inventory_posted_at?: string | null;
          is_unexpected?: boolean;
          missing_quantity?: number;
          notes?: string | null;
          product_id?: string;
          received_quantity?: number;
          shipment_id?: string;
          tracking_box_id?: string | null;
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
          {
            foreignKeyName: "incoming_items_tracking_box_id_fkey";
            columns: ["tracking_box_id"];
            isOneToOne: false;
            referencedRelation: "incoming_tracking_boxes";
            referencedColumns: ["id"];
          },
        ];
      };
      incoming_tracking_boxes: {
        Row: {
          carrier: string | null;
          created_at: string;
          deleted_at: string | null;
          id: string;
          inventory_posted_at: string | null;
          issue_notes: string | null;
          shipment_id: string;
          status: "In Transit" | "Delivered" | "Received" | "Issue";
          tracking_number: string;
          updated_at: string;
        };
        Insert: {
          carrier?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          inventory_posted_at?: string | null;
          issue_notes?: string | null;
          shipment_id: string;
          status?: "In Transit" | "Delivered" | "Received" | "Issue";
          tracking_number: string;
          updated_at?: string;
        };
        Update: {
          carrier?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          inventory_posted_at?: string | null;
          issue_notes?: string | null;
          shipment_id?: string;
          status?: "In Transit" | "Delivered" | "Received" | "Issue";
          tracking_number?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "incoming_tracking_boxes_shipment_id_fkey";
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
      invoice_items: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          description: string;
          id: string;
          invoice_id: string;
          item_type:
            | "service"
            | "storage_fee"
            | "repack_fee"
            | "custom_labor"
            | "discount"
            | "urgent_processing";
          line_total: number;
          quantity: number;
          request_item_service_id: string | null;
          service_request_id: string | null;
          sort_order: number;
          unit_price: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          description: string;
          id?: string;
          invoice_id: string;
          item_type?:
            | "service"
            | "storage_fee"
            | "repack_fee"
            | "custom_labor"
            | "discount"
            | "urgent_processing";
          line_total?: number;
          quantity?: number;
          request_item_service_id?: string | null;
          service_request_id?: string | null;
          sort_order?: number;
          unit_price?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          description?: string;
          id?: string;
          invoice_id?: string;
          item_type?:
            | "service"
            | "storage_fee"
            | "repack_fee"
            | "custom_labor"
            | "discount"
            | "urgent_processing";
          line_total?: number;
          quantity?: number;
          request_item_service_id?: string | null;
          service_request_id?: string | null;
          sort_order?: number;
          unit_price?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoice_items_request_item_service_id_fkey";
            columns: ["request_item_service_id"];
            isOneToOne: false;
            referencedRelation: "request_item_services";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoice_items_service_request_id_fkey";
            columns: ["service_request_id"];
            isOneToOne: false;
            referencedRelation: "service_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      invoices: {
        Row: {
          balance_due: number;
          client_id: string;
          created_at: string;
          deleted_at: string | null;
          discount_total: number;
          due_date: string;
          id: string;
          invoice_number: string;
          issue_date: string;
          notes: string | null;
          paid_amount: number;
          service_request_id: string;
          status:
            | "Draft"
            | "Sent"
            | "Unpaid"
            | "Partial Paid"
            | "Paid"
            | "Overdue"
            | "Cancelled";
          subtotal: number;
          total_amount: number;
          updated_at: string;
        };
        Insert: {
          balance_due?: number;
          client_id: string;
          created_at?: string;
          deleted_at?: string | null;
          discount_total?: number;
          due_date?: string;
          id?: string;
          invoice_number?: string;
          issue_date?: string;
          notes?: string | null;
          paid_amount?: number;
          service_request_id: string;
          status?:
            | "Draft"
            | "Sent"
            | "Unpaid"
            | "Partial Paid"
            | "Paid"
            | "Overdue"
            | "Cancelled";
          subtotal?: number;
          total_amount?: number;
          updated_at?: string;
        };
        Update: {
          balance_due?: number;
          client_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          discount_total?: number;
          due_date?: string;
          id?: string;
          invoice_number?: string;
          issue_date?: string;
          notes?: string | null;
          paid_amount?: number;
          service_request_id?: string;
          status?:
            | "Draft"
            | "Sent"
            | "Unpaid"
            | "Partial Paid"
            | "Paid"
            | "Overdue"
            | "Cancelled";
          subtotal?: number;
          total_amount?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_service_request_id_fkey";
            columns: ["service_request_id"];
            isOneToOne: false;
            referencedRelation: "service_requests";
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
      notifications: {
        Row: {
          body: string | null;
          client_id: string | null;
          created_at: string;
          deleted_at: string | null;
          entity_id: string;
          entity_type: string;
          id: string;
          metadata: Json;
          notification_type: string;
          title: string;
        };
        Insert: {
          body?: string | null;
          client_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          entity_id: string;
          entity_type: string;
          id?: string;
          metadata?: Json;
          notification_type: string;
          title: string;
        };
        Update: {
          body?: string | null;
          client_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          metadata?: Json;
          notification_type?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          active: boolean;
          asin: string | null;
          barcode: string | null;
          barcode_type: string | null;
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
          barcode?: string | null;
          barcode_type?: string | null;
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
          barcode?: string | null;
          barcode_type?: string | null;
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
          box_barcode: string | null;
          box_barcode_type: string | null;
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
          box_barcode?: string | null;
          box_barcode_type?: string | null;
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
          box_barcode?: string | null;
          box_barcode_type?: string | null;
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
            | "In Progress"
            | "Rejected"
            | "Cancelled"
            | "Waiting Labels"
            | "Labels Uploaded"
            | "Ready to Pack"
            | "Ready for Prep"
            | "Prep in Progress"
            | "QC Check"
            | "Packing"
            | "Ready to Ship"
            | "Shipped"
            | "Completed"
            | "Issue / On Hold"
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
            | "In Progress"
            | "Rejected"
            | "Cancelled"
            | "Waiting Labels"
            | "Labels Uploaded"
            | "Ready to Pack"
            | "Ready for Prep"
            | "Prep in Progress"
            | "QC Check"
            | "Packing"
            | "Ready to Ship"
            | "Shipped"
            | "Completed"
            | "Issue / On Hold"
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
            | "In Progress"
            | "Rejected"
            | "Cancelled"
            | "Waiting Labels"
            | "Labels Uploaded"
            | "Ready to Pack"
            | "Ready for Prep"
            | "Prep in Progress"
            | "QC Check"
            | "Packing"
            | "Ready to Ship"
            | "Shipped"
            | "Completed"
            | "Issue / On Hold"
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
      shipping_labels: {
        Row: {
          box_number: number | null;
          client_id: string;
          created_at: string;
          deleted_at: string | null;
          entity_id: string | null;
          entity_type: "service_requests" | "outbound_shipments";
          file_name: string;
          file_url: string;
          id: string;
          label_category:
            | "fba_box_label"
            | "shipping_label"
            | "pallet_label"
            | "misc_document";
          mime_type: string | null;
          notes: string | null;
          request_box_id: string | null;
          service_request_id: string | null;
          storage_path: string | null;
          updated_at: string;
          uploaded_by: string | null;
        };
        Insert: {
          box_number?: number | null;
          client_id: string;
          created_at?: string;
          deleted_at?: string | null;
          entity_id?: string | null;
          entity_type?: "service_requests" | "outbound_shipments";
          file_name: string;
          file_url: string;
          id?: string;
          label_category:
            | "fba_box_label"
            | "shipping_label"
            | "pallet_label"
            | "misc_document";
          mime_type?: string | null;
          notes?: string | null;
          request_box_id?: string | null;
          service_request_id?: string | null;
          storage_path?: string | null;
          updated_at?: string;
          uploaded_by?: string | null;
        };
        Update: {
          box_number?: number | null;
          client_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          entity_id?: string | null;
          entity_type?: "service_requests" | "outbound_shipments";
          file_name?: string;
          file_url?: string;
          id?: string;
          label_category?:
            | "fba_box_label"
            | "shipping_label"
            | "pallet_label"
            | "misc_document";
          mime_type?: string | null;
          notes?: string | null;
          request_box_id?: string | null;
          service_request_id?: string | null;
          storage_path?: string | null;
          updated_at?: string;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "shipping_labels_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shipping_labels_request_box_id_fkey";
            columns: ["request_box_id"];
            isOneToOne: false;
            referencedRelation: "request_boxes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shipping_labels_service_request_id_fkey";
            columns: ["service_request_id"];
            isOneToOne: false;
            referencedRelation: "service_requests";
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
      user_notifications: {
        Row: {
          created_at: string;
          id: string;
          notification_id: string;
          read_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          notification_id: string;
          read_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          notification_id?: string;
          read_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_notifications_notification_id_fkey";
            columns: ["notification_id"];
            isOneToOne: false;
            referencedRelation: "notifications";
            referencedColumns: ["id"];
          },
        ];
      };
      warehouse_tasks: {
        Row: {
          assigned_to: string | null;
          barcode: string | null;
          client_id: string;
          completed_at: string | null;
          created_at: string;
          deleted_at: string | null;
          due_date: string | null;
          id: string;
          internal_notes: string | null;
          priority: "Low" | "Normal" | "High" | "Urgent";
          product_id: string | null;
          quantity: number;
          request_box_id: string | null;
          request_item_id: string | null;
          service_request_id: string | null;
          status:
            | "Pending"
            | "Picking"
            | "Packing"
            | "QC"
            | "Ready to Ship"
            | "Completed"
            | "On Hold"
            | "Cancelled";
          task_type:
            | "picking"
            | "packing"
            | "qc"
            | "ready_to_ship"
            | "inventory_adjustment"
            | "general";
          updated_at: string;
        };
        Insert: {
          assigned_to?: string | null;
          barcode?: string | null;
          client_id: string;
          completed_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          due_date?: string | null;
          id?: string;
          internal_notes?: string | null;
          priority?: "Low" | "Normal" | "High" | "Urgent";
          product_id?: string | null;
          quantity?: number;
          request_box_id?: string | null;
          request_item_id?: string | null;
          service_request_id?: string | null;
          status?:
            | "Pending"
            | "Picking"
            | "Packing"
            | "QC"
            | "Ready to Ship"
            | "Completed"
            | "On Hold"
            | "Cancelled";
          task_type?:
            | "picking"
            | "packing"
            | "qc"
            | "ready_to_ship"
            | "inventory_adjustment"
            | "general";
          updated_at?: string;
        };
        Update: {
          assigned_to?: string | null;
          barcode?: string | null;
          client_id?: string;
          completed_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          due_date?: string | null;
          id?: string;
          internal_notes?: string | null;
          priority?: "Low" | "Normal" | "High" | "Urgent";
          product_id?: string | null;
          quantity?: number;
          request_box_id?: string | null;
          request_item_id?: string | null;
          service_request_id?: string | null;
          status?:
            | "Pending"
            | "Picking"
            | "Packing"
            | "QC"
            | "Ready to Ship"
            | "Completed"
            | "On Hold"
            | "Cancelled";
          task_type?:
            | "picking"
            | "packing"
            | "qc"
            | "ready_to_ship"
            | "inventory_adjustment"
            | "general";
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "warehouse_tasks_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "warehouse_tasks_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "warehouse_tasks_request_box_id_fkey";
            columns: ["request_box_id"];
            isOneToOne: false;
            referencedRelation: "request_boxes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "warehouse_tasks_request_item_id_fkey";
            columns: ["request_item_id"];
            isOneToOne: false;
            referencedRelation: "request_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "warehouse_tasks_service_request_id_fkey";
            columns: ["service_request_id"];
            isOneToOne: false;
            referencedRelation: "service_requests";
            referencedColumns: ["id"];
          },
        ];
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
      is_warehouse_operator: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      adjust_inventory_quantities: {
        Args: {
          p_inventory_id: string;
          p_available_delta?: number;
          p_reserved_delta?: number;
          p_processing_delta?: number;
          p_shipped_delta?: number;
          p_damaged_delta?: number;
        };
        Returns: undefined;
      };
      post_incoming_item_to_inventory: {
        Args: {
          p_incoming_item_id: string;
          p_received_quantity: number;
          p_damaged_quantity?: number;
          p_missing_quantity?: number;
        };
        Returns: undefined;
      };
      post_incoming_tracking_box_to_inventory: {
        Args: { p_tracking_box_id: string };
        Returns: undefined;
      };
      sync_incoming_shipment_receiving_status: {
        Args: { p_shipment_id: string };
        Returns: undefined;
      };
      reserve_inventory_for_request_item: {
        Args: { p_request_item_id: string };
        Returns: undefined;
      };
      release_inventory_for_request_item: {
        Args: { p_request_item_id: string };
        Returns: undefined;
      };
      mark_overdue_invoices: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      generate_invoice_for_service_request: {
        Args: { p_request_id: string };
        Returns: string;
      };
      recalculate_invoice_totals: {
        Args: { p_invoice_id: string };
        Returns: undefined;
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
