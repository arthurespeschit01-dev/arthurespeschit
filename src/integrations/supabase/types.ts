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
      ad_sets: {
        Row: {
          bid_strategy: string | null
          campaign_id: string
          clicks: number | null
          cpa: number | null
          cpc: number | null
          cpm: number | null
          created_at: string
          ctr: number | null
          daily_budget: number | null
          end_time: string | null
          engagements: number
          frequency: number
          id: string
          impressions: number | null
          last_synced_at: string | null
          leads: number | null
          lifetime_budget: number | null
          link_clicks: number | null
          messages: number | null
          meta_adset_id: string | null
          meta_campaign_id: string | null
          name: string
          optimization_goal: string | null
          purchases: number | null
          reach: number | null
          revenue: number | null
          roas: number | null
          source: string
          spend: number | null
          start_time: string | null
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bid_strategy?: string | null
          campaign_id: string
          clicks?: number | null
          cpa?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          daily_budget?: number | null
          end_time?: string | null
          engagements?: number
          frequency?: number
          id?: string
          impressions?: number | null
          last_synced_at?: string | null
          leads?: number | null
          lifetime_budget?: number | null
          link_clicks?: number | null
          messages?: number | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          name: string
          optimization_goal?: string | null
          purchases?: number | null
          reach?: number | null
          revenue?: number | null
          roas?: number | null
          source?: string
          spend?: number | null
          start_time?: string | null
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bid_strategy?: string | null
          campaign_id?: string
          clicks?: number | null
          cpa?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          daily_budget?: number | null
          end_time?: string | null
          engagements?: number
          frequency?: number
          id?: string
          impressions?: number | null
          last_synced_at?: string | null
          leads?: number | null
          lifetime_budget?: number | null
          link_clicks?: number | null
          messages?: number | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          name?: string
          optimization_goal?: string | null
          purchases?: number | null
          reach?: number | null
          revenue?: number | null
          roas?: number | null
          source?: string
          spend?: number | null
          start_time?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_sets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_notes: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          text: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          text: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          budget: number | null
          clicks: number | null
          client_id: string
          cpa: number | null
          cpc: number | null
          cpm: number | null
          created_at: string
          ctr: number | null
          date_preset: string | null
          engagements: number
          frequency: number | null
          id: string
          impressions: number | null
          last_synced_at: string | null
          leads: number | null
          link_clicks: number | null
          messages: number | null
          meta_ad_account_id: string | null
          meta_campaign_id: string | null
          name: string
          notes: string | null
          objective: string | null
          platform: string | null
          purchases: number | null
          reach: number | null
          revenue: number | null
          roas: number | null
          source: string
          spend: number | null
          start_date: string | null
          status: string | null
          updated_at: string
          user_id: string
          video_views: number | null
        }
        Insert: {
          budget?: number | null
          clicks?: number | null
          client_id: string
          cpa?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          date_preset?: string | null
          engagements?: number
          frequency?: number | null
          id?: string
          impressions?: number | null
          last_synced_at?: string | null
          leads?: number | null
          link_clicks?: number | null
          messages?: number | null
          meta_ad_account_id?: string | null
          meta_campaign_id?: string | null
          name: string
          notes?: string | null
          objective?: string | null
          platform?: string | null
          purchases?: number | null
          reach?: number | null
          revenue?: number | null
          roas?: number | null
          source?: string
          spend?: number | null
          start_date?: string | null
          status?: string | null
          updated_at?: string
          user_id: string
          video_views?: number | null
        }
        Update: {
          budget?: number | null
          clicks?: number | null
          client_id?: string
          cpa?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          date_preset?: string | null
          engagements?: number
          frequency?: number | null
          id?: string
          impressions?: number | null
          last_synced_at?: string | null
          leads?: number | null
          link_clicks?: number | null
          messages?: number | null
          meta_ad_account_id?: string | null
          meta_campaign_id?: string | null
          name?: string
          notes?: string | null
          objective?: string | null
          platform?: string | null
          purchases?: number | null
          reach?: number | null
          revenue?: number | null
          roas?: number | null
          source?: string
          spend?: number | null
          start_date?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string
          video_views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      case_studies: {
        Row: {
          challenge: string | null
          client_name: string
          created_at: string
          id: string
          learnings: string | null
          niche: string | null
          results: string | null
          strategy: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          challenge?: string | null
          client_name: string
          created_at?: string
          id?: string
          learnings?: string | null
          niche?: string | null
          results?: string | null
          strategy?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          challenge?: string | null
          client_name?: string
          created_at?: string
          id?: string
          learnings?: string | null
          niche?: string | null
          results?: string | null
          strategy?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      client_attachments: {
        Row: {
          category: string
          client_id: string
          created_at: string
          file_name: string
          file_url: string
          id: string
          user_id: string
        }
        Insert: {
          category?: string
          client_id: string
          created_at?: string
          file_name: string
          file_url: string
          id?: string
          user_id: string
        }
        Update: {
          category?: string
          client_id?: string
          created_at?: string
          file_name?: string
          file_url?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_attachments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          account_ids: Json | null
          contract_duration: string | null
          created_at: string
          id: string
          monthly_fee: number | null
          name: string
          niche: string | null
          payment_day: number | null
          phone: string | null
          services: string | null
          status: string | null
          updated_at: string
          user_id: string
          verba_mensal: number | null
        }
        Insert: {
          account_ids?: Json | null
          contract_duration?: string | null
          created_at?: string
          id?: string
          monthly_fee?: number | null
          name: string
          niche?: string | null
          payment_day?: number | null
          phone?: string | null
          services?: string | null
          status?: string | null
          updated_at?: string
          user_id: string
          verba_mensal?: number | null
        }
        Update: {
          account_ids?: Json | null
          contract_duration?: string | null
          created_at?: string
          id?: string
          monthly_fee?: number | null
          name?: string
          niche?: string | null
          payment_day?: number | null
          phone?: string | null
          services?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string
          verba_mensal?: number | null
        }
        Relationships: []
      }
      closing_scripts: {
        Row: {
          content: string | null
          created_at: string
          id: string
          scenario: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          scenario: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          scenario?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contract_attachments: {
        Row: {
          contract_id: string
          created_at: string
          file_name: string
          file_url: string
          id: string
          user_id: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          file_name: string
          file_url: string
          id?: string
          user_id: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          file_name?: string
          file_url?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_attachments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "signed_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_templates: {
        Row: {
          content: string | null
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      creatives: {
        Row: {
          body: string | null
          campaign_id: string
          clicks: number | null
          cpa: number | null
          cpc: number | null
          cpm: number | null
          created_at: string
          ctr: number | null
          engagements: number
          frequency: number
          id: string
          impressions: number | null
          last_synced_at: string | null
          leads: number | null
          link: string | null
          link_clicks: number | null
          messages: number | null
          meta_ad_id: string | null
          meta_creative_id: string | null
          name: string
          purchases: number | null
          reach: number | null
          revenue: number | null
          roas: number | null
          source: string
          spend: number | null
          status: string
          thumbnail_url: string | null
          title: string | null
          type: string
          updated_at: string
          user_id: string
          video_views: number
        }
        Insert: {
          body?: string | null
          campaign_id: string
          clicks?: number | null
          cpa?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          engagements?: number
          frequency?: number
          id?: string
          impressions?: number | null
          last_synced_at?: string | null
          leads?: number | null
          link?: string | null
          link_clicks?: number | null
          messages?: number | null
          meta_ad_id?: string | null
          meta_creative_id?: string | null
          name: string
          purchases?: number | null
          reach?: number | null
          revenue?: number | null
          roas?: number | null
          source?: string
          spend?: number | null
          status?: string
          thumbnail_url?: string | null
          title?: string | null
          type?: string
          updated_at?: string
          user_id: string
          video_views?: number
        }
        Update: {
          body?: string | null
          campaign_id?: string
          clicks?: number | null
          cpa?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          engagements?: number
          frequency?: number
          id?: string
          impressions?: number | null
          last_synced_at?: string | null
          leads?: number | null
          link?: string | null
          link_clicks?: number | null
          messages?: number | null
          meta_ad_id?: string | null
          meta_creative_id?: string | null
          name?: string
          purchases?: number | null
          reach?: number | null
          revenue?: number | null
          roas?: number | null
          source?: string
          spend?: number | null
          status?: string
          thumbnail_url?: string | null
          title?: string | null
          type?: string
          updated_at?: string
          user_id?: string
          video_views?: number
        }
        Relationships: [
          {
            foreignKeyName: "creatives_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      mensalidades: {
        Row: {
          cliente_id: string
          created_at: string
          data_pagamento: string | null
          id: string
          status: string
          updated_at: string
          user_id: string
          valor: number
          vencimento: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          data_pagamento?: string | null
          id?: string
          status?: string
          updated_at?: string
          user_id: string
          valor?: number
          vencimento: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          data_pagamento?: string | null
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
          valor?: number
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensalidades_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_connections: {
        Row: {
          access_token: string
          client_id: string
          created_at: string
          id: string
          meta_user_id: string | null
          selected_ad_account_id: string | null
          selected_ad_account_name: string | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          client_id: string
          created_at?: string
          id?: string
          meta_user_id?: string | null
          selected_ad_account_id?: string | null
          selected_ad_account_name?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          client_id?: string
          created_at?: string
          id?: string
          meta_user_id?: string | null
          selected_ad_account_id?: string | null
          selected_ad_account_name?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_connections_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_oauth_states: {
        Row: {
          client_id: string
          created_at: string
          state: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          state: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_states: {
        Row: {
          created_at: string
          id: string
          notification_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notification_id: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notification_id?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      objections: {
        Row: {
          created_at: string
          id: string
          objection: string
          response: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          objection: string
          response?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          objection?: string
          response?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      onboarding_steps: {
        Row: {
          created_at: string
          id: string
          position: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          position?: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      operational_tasks: {
        Row: {
          client_id: string | null
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          priority: string
          recurrence: string
          recurrence_days: Json
          recurrence_interval: number
          start_date: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          priority?: string
          recurrence?: string
          recurrence_days?: Json
          recurrence_interval?: number
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          priority?: string
          recurrence?: string
          recurrence_days?: Json
          recurrence_interval?: number
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      result_rows: {
        Row: {
          client_id: string
          cpa: number | null
          created_at: string
          id: string
          investment: number | null
          leads: number | null
          notes: string | null
          period: string | null
          revenue: number | null
          roas: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          cpa?: number | null
          created_at?: string
          id?: string
          investment?: number | null
          leads?: number | null
          notes?: string | null
          period?: string | null
          revenue?: number | null
          roas?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          cpa?: number | null
          created_at?: string
          id?: string
          investment?: number | null
          leads?: number | null
          notes?: string | null
          period?: string | null
          revenue?: number | null
          roas?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "result_rows_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      signed_contracts: {
        Row: {
          client_name: string
          created_at: string
          expiry_date: string | null
          file_name: string | null
          file_url: string | null
          id: string
          notes: string | null
          signed_date: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_name: string
          created_at?: string
          expiry_date?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          signed_date?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_name?: string
          created_at?: string
          expiry_date?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          signed_date?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      strategy_conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      strategy_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "strategy_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_url: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_url: string
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_url?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "operational_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          created_at: string
          id: string
          task_id: string
          text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          task_id: string
          text: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          task_id?: string
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "operational_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      traffic_records: {
        Row: {
          client_id: string
          created_at: string
          funnel_config: Json
          id: string
          monthly_data: Json
          objectives: Json
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          client_id: string
          created_at?: string
          funnel_config?: Json
          id?: string
          monthly_data?: Json
          objectives?: Json
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          client_id?: string
          created_at?: string
          funnel_config?: Json
          id?: string
          monthly_data?: Json
          objectives?: Json
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      transacoes: {
        Row: {
          categoria: string | null
          cliente_id: string | null
          created_at: string
          data: string
          descricao: string
          id: string
          tipo: string
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          categoria?: string | null
          cliente_id?: string | null
          created_at?: string
          data?: string
          descricao: string
          id?: string
          tipo: string
          updated_at?: string
          user_id: string
          valor?: number
        }
        Update: {
          categoria?: string | null
          cliente_id?: string | null
          created_at?: string
          data?: string
          descricao?: string
          id?: string
          tipo?: string
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "transacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
