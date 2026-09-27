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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      availability_blocks: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          organization_id: string
          profile_id: string | null
          reason: string | null
          starts_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          organization_id: string
          profile_id?: string | null
          reason?: string | null
          starts_at: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          organization_id?: string
          profile_id?: string | null
          reason?: string | null
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_blocks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_blocks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_blocks_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      broker_availability: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          organization_id: string
          profile_id: string
          starts_at: string
          updated_at: string
          weekday: number
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          organization_id: string
          profile_id: string
          starts_at: string
          updated_at?: string
          weekday: number
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          organization_id?: string
          profile_id?: string
          starts_at?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "broker_availability_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_availability_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          body_html: string
          created_at: string
          description: string | null
          display_order: number
          fields: Json
          icon: string | null
          id: string
          is_active: boolean
          is_system: boolean
          key: string
          name: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          body_html: string
          created_at?: string
          description?: string | null
          display_order?: number
          fields?: Json
          icon?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          key: string
          name: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          body_html?: string
          created_at?: string
          description?: string | null
          display_order?: number
          fields?: Json
          icon?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          key?: string
          name?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name: string | null
          id: string
          lead_id: string | null
          organization_id: string
          property_id: string | null
          rendered_html: string
          template_id: string | null
          template_key: string | null
          title: string
          variables_used: Json
          with_letterhead: boolean
          with_signature: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: string
          lead_id?: string | null
          organization_id: string
          property_id?: string | null
          rendered_html: string
          template_id?: string | null
          template_key?: string | null
          title: string
          variables_used?: Json
          with_letterhead?: boolean
          with_signature?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: string
          lead_id?: string | null
          organization_id?: string
          property_id?: string | null
          rendered_html?: string
          template_id?: string | null
          template_key?: string | null
          title?: string
          variables_used?: Json
          with_letterhead?: boolean
          with_signature?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      error_reports: {
        Row: {
          agente: string | null
          comentario: string | null
          created_at: string
          id: string
          mensagem: string
          organization_id: string | null
          origem: string
          pilha: string | null
          rastro: Json
          resolvido_em: string | null
          rota: string | null
          tela: string | null
          user_id: string | null
          versao: string | null
        }
        Insert: {
          agente?: string | null
          comentario?: string | null
          created_at?: string
          id?: string
          mensagem: string
          organization_id?: string | null
          origem: string
          pilha?: string | null
          rastro?: Json
          resolvido_em?: string | null
          rota?: string | null
          tela?: string | null
          user_id?: string | null
          versao?: string | null
        }
        Update: {
          agente?: string | null
          comentario?: string | null
          created_at?: string
          id?: string
          mensagem?: string
          organization_id?: string | null
          origem?: string
          pilha?: string | null
          rastro?: Json
          resolvido_em?: string | null
          rota?: string | null
          tela?: string | null
          user_id?: string | null
          versao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "error_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_cidades: {
        Row: {
          argumento: string | null
          chamada: string | null
          chamada_fonte: string | null
          cidade: string
          created_at: string
          estado: string
          id: string
          imagem_cena: string | null
          imagem_larga: string | null
          imagem_path: string | null
          locale: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          argumento?: string | null
          chamada?: string | null
          chamada_fonte?: string | null
          cidade: string
          created_at?: string
          estado: string
          id?: string
          imagem_cena?: string | null
          imagem_larga?: string | null
          imagem_path?: string | null
          locale: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          argumento?: string | null
          chamada?: string | null
          chamada_fonte?: string | null
          cidade?: string
          created_at?: string
          estado?: string
          id?: string
          imagem_cena?: string | null
          imagem_larga?: string | null
          imagem_path?: string | null
          locale?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "landing_cidades_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_page_daily: {
        Row: {
          date: string
          form_started: number
          id: string
          landing_page_id: string
          organization_id: string
          quiz_started: number
          scroll_50: number
          scroll_75: number
          views: number
          whatsapp_tap: number
        }
        Insert: {
          date: string
          form_started?: number
          id?: string
          landing_page_id: string
          organization_id: string
          quiz_started?: number
          scroll_50?: number
          scroll_75?: number
          views?: number
          whatsapp_tap?: number
        }
        Update: {
          date?: string
          form_started?: number
          id?: string
          landing_page_id?: string
          organization_id?: string
          quiz_started?: number
          scroll_50?: number
          scroll_75?: number
          views?: number
          whatsapp_tap?: number
        }
        Relationships: [
          {
            foreignKeyName: "landing_page_daily_landing_page_id_fkey"
            columns: ["landing_page_id"]
            isOneToOne: false
            referencedRelation: "landing_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landing_page_daily_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_pages: {
        Row: {
          angulo: string
          created_at: string
          cta_kind: string
          cta_label: string | null
          headline: string | null
          id: string
          is_published: boolean
          layout: string
          locale: string
          market: string
          organization_id: string
          property_id: string
          published_at: string | null
          subheadline: string | null
          updated_at: string
          variant: string
        }
        Insert: {
          angulo: string
          created_at?: string
          cta_kind: string
          cta_label?: string | null
          headline?: string | null
          id?: string
          is_published?: boolean
          layout?: string
          locale?: string
          market?: string
          organization_id: string
          property_id: string
          published_at?: string | null
          subheadline?: string | null
          updated_at?: string
          variant: string
        }
        Update: {
          angulo?: string
          created_at?: string
          cta_kind?: string
          cta_label?: string | null
          headline?: string | null
          id?: string
          is_published?: boolean
          layout?: string
          locale?: string
          market?: string
          organization_id?: string
          property_id?: string
          published_at?: string | null
          subheadline?: string | null
          updated_at?: string
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "landing_pages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landing_pages_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_pontos: {
        Row: {
          chamada: string | null
          cidade: string
          created_at: string
          estado: string
          fecho: string | null
          id: string
          imagens: string[]
          locale: string
          numeros: Json
          organization_id: string
          posicao: number
          texto: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          chamada?: string | null
          cidade: string
          created_at?: string
          estado: string
          fecho?: string | null
          id?: string
          imagens?: string[]
          locale: string
          numeros?: Json
          organization_id: string
          posicao?: number
          texto?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          chamada?: string | null
          cidade?: string
          created_at?: string
          estado?: string
          fecho?: string | null
          id?: string
          imagens?: string[]
          locale?: string
          numeros?: Json
          organization_id?: string
          posicao?: number
          texto?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "landing_pontos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_exportacoes: {
        Row: {
          etapa: string | null
          exportado_em: string
          exportado_por: string | null
          exportado_por_nome: string | null
          id: string
          organization_id: string
          periodo_ate: string
          periodo_de: string
          quantidade: number
          responsavel: string | null
        }
        Insert: {
          etapa?: string | null
          exportado_em?: string
          exportado_por?: string | null
          exportado_por_nome?: string | null
          id?: string
          organization_id: string
          periodo_ate: string
          periodo_de: string
          quantidade: number
          responsavel?: string | null
        }
        Update: {
          etapa?: string | null
          exportado_em?: string
          exportado_por?: string | null
          exportado_por_nome?: string | null
          id?: string
          organization_id?: string
          periodo_ate?: string
          periodo_de?: string
          quantidade?: number
          responsavel?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_exportacoes_etapa_fkey"
            columns: ["etapa"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_exportacoes_exportado_por_fkey"
            columns: ["exportado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_exportacoes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_exportacoes_responsavel_fkey"
            columns: ["responsavel"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_property_interests: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          lead_id: string
          notes: string | null
          organization_id: string
          property_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          lead_id: string
          notes?: string | null
          organization_id: string
          property_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          lead_id?: string
          notes?: string | null
          organization_id?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_property_interests_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_property_interests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_property_interests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_reminders: {
        Row: {
          assigned_to: string
          body: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
          notified_at: string | null
          organization_id: string
          remind_at: string
          snooze_count: number
          status: string
          title: string
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          assigned_to: string
          body?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
          notified_at?: string | null
          organization_id: string
          remind_at: string
          snooze_count?: number
          status?: string
          title: string
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          assigned_to?: string
          body?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
          notified_at?: string | null
          organization_id?: string
          remind_at?: string
          snooze_count?: number
          status?: string
          title?: string
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_reminders_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_reminders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_reminders_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_reminders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_reminders_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_timeline_events: {
        Row: {
          actor_label: string | null
          actor_user_id: string | null
          category: string
          description: string | null
          event_type: string
          id: string
          lead_id: string
          metadata: Json
          occurred_at: string
          organization_id: string
          title: string
        }
        Insert: {
          actor_label?: string | null
          actor_user_id?: string | null
          category: string
          description?: string | null
          event_type: string
          id?: string
          lead_id: string
          metadata?: Json
          occurred_at?: string
          organization_id: string
          title: string
        }
        Update: {
          actor_label?: string | null
          actor_user_id?: string | null
          category?: string
          description?: string | null
          event_type?: string
          id?: string
          lead_id?: string
          metadata?: Json
          occurred_at?: string
          organization_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_timeline_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_timeline_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_timeline_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          ab_contaminated: boolean
          assigned_to: string | null
          attribution_method: string
          city: string | null
          commission_pct: number | null
          created_at: string
          deal_value_cents: number | null
          email: string | null
          encaixe_financeiro: string | null
          entry_point: string | null
          espera_avisada: string | null
          esperando_desde: string | null
          excluded_at: string | null
          fbclid: string | null
          finalidade: string | null
          first_contact_at: string | null
          ft_landing_page_id: string | null
          ft_locale: string | null
          ft_meta_ad_id: string | null
          ft_occurred_at: string | null
          ft_utm_campaign: string | null
          ft_utm_source: string | null
          ft_variant: string | null
          full_name: string
          furthest_position: number
          gclid: string | null
          id: string
          landing_page_url: string | null
          loss_reason: string | null
          loss_reason_text: string | null
          lt_landing_page_id: string | null
          lt_meta_ad_id: string | null
          lt_occurred_at: string | null
          lt_variant: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          phone_country: string
          phone_e164: string | null
          prazo_compra: string | null
          referrer: string | null
          silencio_desde: string | null
          source: string
          stage_changed_at: string
          stage_id: string
          tags: string[]
          temperatura: string | null
          temperatura_manual: string | null
          temperatura_regra: string | null
          toques_sem_resposta: number
          updated_at: string
          variants_seen: string[]
        }
        Insert: {
          ab_contaminated?: boolean
          assigned_to?: string | null
          attribution_method?: string
          city?: string | null
          commission_pct?: number | null
          created_at?: string
          deal_value_cents?: number | null
          email?: string | null
          encaixe_financeiro?: string | null
          entry_point?: string | null
          espera_avisada?: string | null
          esperando_desde?: string | null
          excluded_at?: string | null
          fbclid?: string | null
          finalidade?: string | null
          first_contact_at?: string | null
          ft_landing_page_id?: string | null
          ft_locale?: string | null
          ft_meta_ad_id?: string | null
          ft_occurred_at?: string | null
          ft_utm_campaign?: string | null
          ft_utm_source?: string | null
          ft_variant?: string | null
          full_name: string
          furthest_position?: number
          gclid?: string | null
          id?: string
          landing_page_url?: string | null
          loss_reason?: string | null
          loss_reason_text?: string | null
          lt_landing_page_id?: string | null
          lt_meta_ad_id?: string | null
          lt_occurred_at?: string | null
          lt_variant?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          phone_country?: string
          phone_e164?: string | null
          prazo_compra?: string | null
          referrer?: string | null
          silencio_desde?: string | null
          source?: string
          stage_changed_at?: string
          stage_id: string
          tags?: string[]
          temperatura?: string | null
          temperatura_manual?: string | null
          temperatura_regra?: string | null
          toques_sem_resposta?: number
          updated_at?: string
          variants_seen?: string[]
        }
        Update: {
          ab_contaminated?: boolean
          assigned_to?: string | null
          attribution_method?: string
          city?: string | null
          commission_pct?: number | null
          created_at?: string
          deal_value_cents?: number | null
          email?: string | null
          encaixe_financeiro?: string | null
          entry_point?: string | null
          espera_avisada?: string | null
          esperando_desde?: string | null
          excluded_at?: string | null
          fbclid?: string | null
          finalidade?: string | null
          first_contact_at?: string | null
          ft_landing_page_id?: string | null
          ft_locale?: string | null
          ft_meta_ad_id?: string | null
          ft_occurred_at?: string | null
          ft_utm_campaign?: string | null
          ft_utm_source?: string | null
          ft_variant?: string | null
          full_name?: string
          furthest_position?: number
          gclid?: string | null
          id?: string
          landing_page_url?: string | null
          loss_reason?: string | null
          loss_reason_text?: string | null
          lt_landing_page_id?: string | null
          lt_meta_ad_id?: string | null
          lt_occurred_at?: string | null
          lt_variant?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          phone_country?: string
          phone_e164?: string | null
          prazo_compra?: string | null
          referrer?: string | null
          silencio_desde?: string | null
          source?: string
          stage_changed_at?: string
          stage_id?: string
          tags?: string[]
          temperatura?: string | null
          temperatura_manual?: string | null
          temperatura_regra?: string | null
          toques_sem_resposta?: number
          updated_at?: string
          variants_seen?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      limite_acessos: {
        Row: {
          chave: string
          janela_inicio: string
          n: number
        }
        Insert: {
          chave: string
          janela_inicio?: string
          n?: number
        }
        Update: {
          chave?: string
          janela_inicio?: string
          n?: number
        }
        Relationships: []
      }
      meta_ad_accounts: {
        Row: {
          ad_account_id: string
          created_at: string
          currency: string | null
          enabled: boolean
          id: string
          integration_id: string | null
          name: string | null
          organization_id: string
          synced_at: string | null
          timezone_name: string | null
        }
        Insert: {
          ad_account_id: string
          created_at?: string
          currency?: string | null
          enabled?: boolean
          id?: string
          integration_id?: string | null
          name?: string | null
          organization_id: string
          synced_at?: string | null
          timezone_name?: string | null
        }
        Update: {
          ad_account_id?: string
          created_at?: string
          currency?: string | null
          enabled?: boolean
          id?: string
          integration_id?: string | null
          name?: string | null
          organization_id?: string
          synced_at?: string | null
          timezone_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_accounts_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "meta_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ad_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ad_dimensions: {
        Row: {
          ad_account_id: string
          angulo: string | null
          bid_strategy: string | null
          budget_kind: string | null
          budget_minor: number | null
          conta_no_painel: boolean
          destination_type: string | null
          effective_status: string | null
          id: string
          level: string
          name: string | null
          object_id: string
          objective: string | null
          organization_id: string
          page_id: string | null
          permalink: string | null
          property_id: string | null
          synced_at: string
        }
        Insert: {
          ad_account_id: string
          angulo?: string | null
          bid_strategy?: string | null
          budget_kind?: string | null
          budget_minor?: number | null
          conta_no_painel?: boolean
          destination_type?: string | null
          effective_status?: string | null
          id?: string
          level: string
          name?: string | null
          object_id: string
          objective?: string | null
          organization_id: string
          page_id?: string | null
          permalink?: string | null
          property_id?: string | null
          synced_at?: string
        }
        Update: {
          ad_account_id?: string
          angulo?: string | null
          bid_strategy?: string | null
          budget_kind?: string | null
          budget_minor?: number | null
          conta_no_painel?: boolean
          destination_type?: string | null
          effective_status?: string | null
          id?: string
          level?: string
          name?: string | null
          object_id?: string
          objective?: string | null
          organization_id?: string
          page_id?: string | null
          permalink?: string | null
          property_id?: string | null
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_dimensions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ad_dimensions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ads_spend: {
        Row: {
          ad_account_id: string
          ad_id: string
          adset_id: string
          campaign_id: string
          clicks: number | null
          currency: string
          date: string
          id: string
          import_run_id: string | null
          impressions: number | null
          lead_count: number | null
          link_clicks: number | null
          messaging_count: number | null
          organization_id: string
          report_timezone: string
          spend_minor: number
          synced_at: string
        }
        Insert: {
          ad_account_id: string
          ad_id?: string
          adset_id?: string
          campaign_id: string
          clicks?: number | null
          currency: string
          date: string
          id?: string
          import_run_id?: string | null
          impressions?: number | null
          lead_count?: number | null
          link_clicks?: number | null
          messaging_count?: number | null
          organization_id: string
          report_timezone: string
          spend_minor: number
          synced_at?: string
        }
        Update: {
          ad_account_id?: string
          ad_id?: string
          adset_id?: string
          campaign_id?: string
          clicks?: number | null
          currency?: string
          date?: string
          id?: string
          import_run_id?: string | null
          impressions?: number | null
          lead_count?: number | null
          link_clicks?: number | null
          messaging_count?: number | null
          organization_id?: string
          report_timezone?: string
          spend_minor?: number
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_ads_spend_import_run_id_fkey"
            columns: ["import_run_id"]
            isOneToOne: false
            referencedRelation: "meta_sync_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ads_spend_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_conversoes: {
        Row: {
          criado_em: string
          enviado_em: string | null
          erro: string | null
          erro_codigo: number | null
          estado: string
          evento: string
          id: string
          lead_id: string
          ocorrido_em: string
          organization_id: string
          proxima_em: string
          tentativas: number
          valor_centavos: number | null
        }
        Insert: {
          criado_em?: string
          enviado_em?: string | null
          erro?: string | null
          erro_codigo?: number | null
          estado?: string
          evento: string
          id?: string
          lead_id: string
          ocorrido_em: string
          organization_id: string
          proxima_em?: string
          tentativas?: number
          valor_centavos?: number | null
        }
        Update: {
          criado_em?: string
          enviado_em?: string | null
          erro?: string | null
          erro_codigo?: number | null
          estado?: string
          evento?: string
          id?: string
          lead_id?: string
          ocorrido_em?: string
          organization_id?: string
          proxima_em?: string
          tentativas?: number
          valor_centavos?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_conversoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_conversoes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_forms: {
        Row: {
          first_seen_at: string
          form_id: string
          id: string
          integration_id: string | null
          last_drained_at: string | null
          name: string | null
          organization_id: string
          page_id: string
          status: string | null
        }
        Insert: {
          first_seen_at?: string
          form_id: string
          id?: string
          integration_id?: string | null
          last_drained_at?: string | null
          name?: string | null
          organization_id: string
          page_id: string
          status?: string | null
        }
        Update: {
          first_seen_at?: string
          form_id?: string
          id?: string
          integration_id?: string | null
          last_drained_at?: string | null
          name?: string | null
          organization_id?: string
          page_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_forms_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "meta_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_forms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_integrations: {
        Row: {
          access_token_id: string
          app_id: string
          app_secret_id: string
          created_at: string
          health: string
          health_changed_at: string
          health_error_code: number | null
          health_message: string | null
          id: string
          label: string | null
          organization_id: string
          owner_id: string
          scopes: string[]
          token_expires_at: string | null
          token_type: string | null
          updated_at: string
          webhook_secret_hash: string | null
        }
        Insert: {
          access_token_id: string
          app_id: string
          app_secret_id: string
          created_at?: string
          health?: string
          health_changed_at?: string
          health_error_code?: number | null
          health_message?: string | null
          id?: string
          label?: string | null
          organization_id: string
          owner_id: string
          scopes?: string[]
          token_expires_at?: string | null
          token_type?: string | null
          updated_at?: string
          webhook_secret_hash?: string | null
        }
        Update: {
          access_token_id?: string
          app_id?: string
          app_secret_id?: string
          created_at?: string
          health?: string
          health_changed_at?: string
          health_error_code?: number | null
          health_message?: string | null
          id?: string
          label?: string | null
          organization_id?: string
          owner_id?: string
          scopes?: string[]
          token_expires_at?: string | null
          token_type?: string | null
          updated_at?: string
          webhook_secret_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_integrations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_lead_submissions: {
        Row: {
          captado_em: string
          field_data: Json
          form_id: string
          id: string
          is_organic: boolean
          is_test: boolean
          lead_id: string | null
          leadgen_id: string
          organization_id: string
          received_at: string
        }
        Insert: {
          captado_em: string
          field_data: Json
          form_id: string
          id?: string
          is_organic?: boolean
          is_test?: boolean
          lead_id?: string | null
          leadgen_id: string
          organization_id: string
          received_at?: string
        }
        Update: {
          captado_em?: string
          field_data?: Json
          form_id?: string
          id?: string
          is_organic?: boolean
          is_test?: boolean
          lead_id?: string | null
          leadgen_id?: string
          organization_id?: string
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_lead_submissions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_lead_submissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_pages: {
        Row: {
          created_at: string
          granted_at: string
          id: string
          integration_id: string | null
          organization_id: string
          page_id: string
          page_name: string | null
          page_token_id: string | null
          subscribe_error: string | null
          subscribed_at: string | null
        }
        Insert: {
          created_at?: string
          granted_at?: string
          id?: string
          integration_id?: string | null
          organization_id: string
          page_id: string
          page_name?: string | null
          page_token_id?: string | null
          subscribe_error?: string | null
          subscribed_at?: string | null
        }
        Update: {
          created_at?: string
          granted_at?: string
          id?: string
          integration_id?: string | null
          organization_id?: string
          page_id?: string
          page_name?: string | null
          page_token_id?: string | null
          subscribe_error?: string | null
          subscribed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_pages_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "meta_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_pages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_sync_runs: {
        Row: {
          ad_account_id: string | null
          cursor: string | null
          error_code: number | null
          error_message: string | null
          finished_at: string | null
          id: string
          integration_id: string | null
          kind: string
          organization_id: string
          pages_fetched: number
          rows_fetched: number
          rows_written: number
          started_at: string
          status: string
          truncated: boolean
          window_since: string | null
          window_until: string | null
        }
        Insert: {
          ad_account_id?: string | null
          cursor?: string | null
          error_code?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          integration_id?: string | null
          kind: string
          organization_id: string
          pages_fetched?: number
          rows_fetched?: number
          rows_written?: number
          started_at?: string
          status?: string
          truncated?: boolean
          window_since?: string | null
          window_until?: string | null
        }
        Update: {
          ad_account_id?: string | null
          cursor?: string | null
          error_code?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          integration_id?: string | null
          kind?: string
          organization_id?: string
          pages_fetched?: number
          rows_fetched?: number
          rows_written?: number
          started_at?: string
          status?: string
          truncated?: boolean
          window_since?: string | null
          window_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_sync_runs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "meta_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_sync_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_webhook_inbox: {
        Row: {
          attempts: number
          form_id: string | null
          id: string
          integration_id: string | null
          last_error_code: number | null
          lead_id: string | null
          leadgen_id: string
          motivo: string | null
          next_attempt_at: string
          organization_id: string
          page_id: string
          payload: Json
          processed_at: string | null
          received_at: string
          signature_ok: boolean
          status: string
        }
        Insert: {
          attempts?: number
          form_id?: string | null
          id?: string
          integration_id?: string | null
          last_error_code?: number | null
          lead_id?: string | null
          leadgen_id: string
          motivo?: string | null
          next_attempt_at?: string
          organization_id: string
          page_id: string
          payload: Json
          processed_at?: string | null
          received_at?: string
          signature_ok: boolean
          status?: string
        }
        Update: {
          attempts?: number
          form_id?: string | null
          id?: string
          integration_id?: string | null
          last_error_code?: number | null
          lead_id?: string | null
          leadgen_id?: string
          motivo?: string | null
          next_attempt_at?: string
          organization_id?: string
          page_id?: string
          payload?: Json
          processed_at?: string | null
          received_at?: string
          signature_ok?: boolean
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_webhook_inbox_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "meta_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_webhook_inbox_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_webhook_inbox_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          lead_scope: string
          muted_types: string[]
          organization_id: string
          profile_id: string
          push_enabled: boolean
          updated_at: string
        }
        Insert: {
          lead_scope?: string
          muted_types?: string[]
          organization_id: string
          profile_id: string
          push_enabled?: boolean
          updated_at?: string
        }
        Update: {
          lead_scope?: string
          muted_types?: string[]
          organization_id?: string
          profile_id?: string
          push_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          event_count: number
          group_key: string
          id: string
          is_read: boolean
          last_event_at: string
          link_path: string | null
          organization_id: string
          read_at: string | null
          recipient_id: string
          related_entity_id: string | null
          related_entity_type: string | null
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          event_count?: number
          group_key: string
          id?: string
          is_read?: boolean
          last_event_at?: string
          link_path?: string | null
          organization_id: string
          read_at?: string | null
          recipient_id: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          title: string
          type: string
        }
        Update: {
          body?: string | null
          created_at?: string
          event_count?: number
          group_key?: string
          id?: string
          is_read?: boolean
          last_event_at?: string
          link_path?: string | null
          organization_id?: string
          read_at?: string | null
          recipient_id?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          agente_ativo: boolean
          agente_teto_dia_centavos: number
          aviso_espera_horas: number | null
          brand_color: string | null
          city: string | null
          cnpj: string | null
          cpl_alvo_minor: number | null
          cpl_teto_minor: number | null
          created_at: string
          creci: string | null
          custom_domain: string | null
          default_locale: string
          email: string | null
          enabled_locales: string[]
          id: string
          is_active: boolean
          legal_name: string | null
          logo_url: string | null
          marca_dagua_nas_fotos: boolean
          meta_pixel_id: string | null
          meta_whatsapp_dataset_id: string | null
          name: string
          phone: string | null
          phone_country: string
          slug: string
          state: string | null
          timezone: string
          updated_at: string
          whatsapp_business_account_id: string | null
          whatsapp_instance_limit: number
          whatsapp_numero_pessoal: boolean
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          agente_ativo?: boolean
          agente_teto_dia_centavos?: number
          aviso_espera_horas?: number | null
          brand_color?: string | null
          city?: string | null
          cnpj?: string | null
          cpl_alvo_minor?: number | null
          cpl_teto_minor?: number | null
          created_at?: string
          creci?: string | null
          custom_domain?: string | null
          default_locale?: string
          email?: string | null
          enabled_locales?: string[]
          id?: string
          is_active?: boolean
          legal_name?: string | null
          logo_url?: string | null
          marca_dagua_nas_fotos?: boolean
          meta_pixel_id?: string | null
          meta_whatsapp_dataset_id?: string | null
          name: string
          phone?: string | null
          phone_country?: string
          slug: string
          state?: string | null
          timezone?: string
          updated_at?: string
          whatsapp_business_account_id?: string | null
          whatsapp_instance_limit?: number
          whatsapp_numero_pessoal?: boolean
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          agente_ativo?: boolean
          agente_teto_dia_centavos?: number
          aviso_espera_horas?: number | null
          brand_color?: string | null
          city?: string | null
          cnpj?: string | null
          cpl_alvo_minor?: number | null
          cpl_teto_minor?: number | null
          created_at?: string
          creci?: string | null
          custom_domain?: string | null
          default_locale?: string
          email?: string | null
          enabled_locales?: string[]
          id?: string
          is_active?: boolean
          legal_name?: string | null
          logo_url?: string | null
          marca_dagua_nas_fotos?: boolean
          meta_pixel_id?: string | null
          meta_whatsapp_dataset_id?: string | null
          name?: string
          phone?: string | null
          phone_country?: string
          slug?: string
          state?: string | null
          timezone?: string
          updated_at?: string
          whatsapp_business_account_id?: string | null
          whatsapp_instance_limit?: number
          whatsapp_numero_pessoal?: boolean
          zip_code?: string | null
        }
        Relationships: []
      }
      pipeline_stages: {
        Row: {
          color: string
          created_at: string
          id: string
          is_active: boolean
          is_lost: boolean
          is_won: boolean
          key: string
          label: string
          organization_id: string
          position: number
          requires_reason: boolean
          requires_schedule: boolean
          requires_value: boolean
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_lost?: boolean
          is_won?: boolean
          key: string
          label: string
          organization_id: string
          position: number
          requires_reason?: boolean
          requires_schedule?: boolean
          requires_value?: boolean
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_lost?: boolean
          is_won?: boolean
          key?: string
          label?: string
          organization_id?: string
          position?: number
          requires_reason?: boolean
          requires_schedule?: boolean
          requires_value?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          creci: string | null
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          organization_id: string
          phone: string | null
          phone_country: string
          theme_color: string
          title: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          creci?: string | null
          email?: string | null
          full_name: string
          id: string
          is_active?: boolean
          organization_id: string
          phone?: string | null
          phone_country?: string
          theme_color?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          creci?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          phone?: string | null
          phone_country?: string
          theme_color?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address: string | null
          address_number: string | null
          amenities: string[]
          apresentacao_path: string | null
          area_built: number | null
          area_total: number | null
          bathrooms: number | null
          bedrooms: number | null
          city: string | null
          complement: string | null
          condo_fee_cents: number | null
          construction_status: string | null
          created_at: string
          created_by: string | null
          delivery_at: string | null
          description: string | null
          developer: string | null
          down_payment_cents: number | null
          floor: number | null
          for_rent: boolean
          for_sale: boolean
          hero_metade_path: string | null
          highlights: string[]
          id: string
          installment_cents: number | null
          installments_count: number | null
          internal_notes: string | null
          iptu_year_cents: number | null
          is_featured: boolean
          is_published: boolean
          keys_cents: number | null
          latitude: number | null
          longitude: number | null
          neighborhood: string | null
          organization_id: string
          owner_id: string | null
          parking_spots: number | null
          payment_methods: string[]
          payment_notes: string | null
          ponto_distancia_m: number | null
          price_cents: number | null
          property_type: string
          public_code: string
          public_title: string | null
          published_at: string | null
          purpose: string | null
          recorte_path: string | null
          reinforcement_cents: number | null
          reinforcement_count: number | null
          reinforcement_period: string | null
          rent_cents: number | null
          rental_guarantees: string[]
          show_exact_address: boolean
          slug: string | null
          state: string | null
          status: string
          suites: number | null
          title: string
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          address_number?: string | null
          amenities?: string[]
          apresentacao_path?: string | null
          area_built?: number | null
          area_total?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string | null
          complement?: string | null
          condo_fee_cents?: number | null
          construction_status?: string | null
          created_at?: string
          created_by?: string | null
          delivery_at?: string | null
          description?: string | null
          developer?: string | null
          down_payment_cents?: number | null
          floor?: number | null
          for_rent?: boolean
          for_sale?: boolean
          hero_metade_path?: string | null
          highlights?: string[]
          id?: string
          installment_cents?: number | null
          installments_count?: number | null
          internal_notes?: string | null
          iptu_year_cents?: number | null
          is_featured?: boolean
          is_published?: boolean
          keys_cents?: number | null
          latitude?: number | null
          longitude?: number | null
          neighborhood?: string | null
          organization_id: string
          owner_id?: string | null
          parking_spots?: number | null
          payment_methods?: string[]
          payment_notes?: string | null
          ponto_distancia_m?: number | null
          price_cents?: number | null
          property_type?: string
          public_code?: string
          public_title?: string | null
          published_at?: string | null
          purpose?: string | null
          recorte_path?: string | null
          reinforcement_cents?: number | null
          reinforcement_count?: number | null
          reinforcement_period?: string | null
          rent_cents?: number | null
          rental_guarantees?: string[]
          show_exact_address?: boolean
          slug?: string | null
          state?: string | null
          status?: string
          suites?: number | null
          title: string
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          address_number?: string | null
          amenities?: string[]
          apresentacao_path?: string | null
          area_built?: number | null
          area_total?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string | null
          complement?: string | null
          condo_fee_cents?: number | null
          construction_status?: string | null
          created_at?: string
          created_by?: string | null
          delivery_at?: string | null
          description?: string | null
          developer?: string | null
          down_payment_cents?: number | null
          floor?: number | null
          for_rent?: boolean
          for_sale?: boolean
          hero_metade_path?: string | null
          highlights?: string[]
          id?: string
          installment_cents?: number | null
          installments_count?: number | null
          internal_notes?: string | null
          iptu_year_cents?: number | null
          is_featured?: boolean
          is_published?: boolean
          keys_cents?: number | null
          latitude?: number | null
          longitude?: number | null
          neighborhood?: string | null
          organization_id?: string
          owner_id?: string | null
          parking_spots?: number | null
          payment_methods?: string[]
          payment_notes?: string | null
          ponto_distancia_m?: number | null
          price_cents?: number | null
          property_type?: string
          public_code?: string
          public_title?: string | null
          published_at?: string | null
          purpose?: string | null
          recorte_path?: string | null
          reinforcement_cents?: number | null
          reinforcement_count?: number | null
          reinforcement_period?: string | null
          rent_cents?: number | null
          rental_guarantees?: string[]
          show_exact_address?: boolean
          slug?: string | null
          state?: string | null
          status?: string
          suites?: number | null
          title?: string
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_owner_fk"
            columns: ["organization_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "property_owners"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "properties_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      property_media: {
        Row: {
          alt_text: string | null
          bytes: number | null
          caption: string | null
          created_at: string
          height: number | null
          id: string
          is_cover: boolean
          kind: string
          marca_dagua: boolean
          mime_type: string | null
          original_sem_marca: Json | null
          organization_id: string
          position: number
          property_id: string
          room: string | null
          storage_path: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          bytes?: number | null
          caption?: string | null
          created_at?: string
          height?: number | null
          id?: string
          is_cover?: boolean
          kind?: string
          marca_dagua?: boolean
          mime_type?: string | null
          original_sem_marca?: Json | null
          organization_id: string
          position?: number
          property_id: string
          room?: string | null
          storage_path: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          bytes?: number | null
          caption?: string | null
          created_at?: string
          height?: number | null
          id?: string
          is_cover?: boolean
          kind?: string
          marca_dagua?: boolean
          mime_type?: string | null
          original_sem_marca?: Json | null
          organization_id?: string
          position?: number
          property_id?: string
          room?: string | null
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "property_media_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_media_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_owners: {
        Row: {
          city: string | null
          created_at: string
          full_name: string
          id: string
          organization_id: string
          phone_e164: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          full_name: string
          id?: string
          organization_id: string
          phone_e164: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          full_name?: string
          id?: string
          organization_id?: string
          phone_e164?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_owners_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      property_page_views: {
        Row: {
          day: string
          organization_id: string
          property_id: string
          views: number
        }
        Insert: {
          day: string
          organization_id: string
          property_id: string
          views?: number
        }
        Update: {
          day?: string
          organization_id?: string
          property_id?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "property_page_views_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_page_views_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_slug_history: {
        Row: {
          id: string
          old_slug: string
          organization_id: string
          property_id: string
          replaced_at: string
        }
        Insert: {
          id?: string
          old_slug: string
          organization_id: string
          property_id: string
          replaced_at?: string
        }
        Update: {
          id?: string
          old_slug?: string
          organization_id?: string
          property_id?: string
          replaced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_slug_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_slug_history_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      push_outbox: {
        Row: {
          attempts: number
          available_at: string
          created_at: string
          id: string
          last_error: string | null
          notification_id: string
          organization_id: string
          payload: Json
          sent_at: string | null
          status: string
          subscription_id: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          created_at?: string
          id?: string
          last_error?: string | null
          notification_id: string
          organization_id: string
          payload: Json
          sent_at?: string | null
          status?: string
          subscription_id: string
        }
        Update: {
          attempts?: number
          available_at?: string
          created_at?: string
          id?: string
          last_error?: string | null
          notification_id?: string
          organization_id?: string
          payload?: Json
          sent_at?: string | null
          status?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_outbox_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_outbox_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_outbox_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          failure_count: number
          id: string
          last_failure_at: string | null
          last_seen_at: string
          last_success_at: string | null
          organization_id: string
          p256dh: string
          profile_id: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          failure_count?: number
          id?: string
          last_failure_at?: string | null
          last_seen_at?: string
          last_success_at?: string | null
          organization_id: string
          p256dh: string
          profile_id: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          failure_count?: number
          id?: string
          last_failure_at?: string | null
          last_seen_at?: string
          last_success_at?: string | null
          organization_id?: string
          p256dh?: string
          profile_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          assigned_to: string | null
          cancel_reason: string | null
          closed_at: string | null
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          lead_id: string
          notes: string | null
          organization_id: string
          outcome_notes: string | null
          property_id: string | null
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          cancel_reason?: string | null
          closed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          lead_id: string
          notes?: string | null
          organization_id: string
          outcome_notes?: string | null
          property_id?: string | null
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          cancel_reason?: string | null
          closed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          lead_id?: string
          notes?: string | null
          organization_id?: string
          outcome_notes?: string | null
          property_id?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          agente_espera_desde: string | null
          agente_pausado_em: string | null
          agente_pausado_por: string | null
          agente_responder_em: string | null
          archived_at: string | null
          classification: string | null
          contact_e164: string | null
          contact_lid: string | null
          contact_name: string | null
          created_at: string
          foto_em: string | null
          foto_erro: string | null
          foto_origem: string | null
          foto_path: string | null
          foto_url: string | null
          group_jid: string | null
          group_subject: string | null
          id: string
          instance_id: string | null
          is_group: boolean
          last_message_at: string | null
          last_message_body: string | null
          lead_id: string | null
          organization_id: string
          property_id: string | null
          ref_code: string | null
          unread_count: number
          updated_at: string
        }
        Insert: {
          agente_espera_desde?: string | null
          agente_pausado_em?: string | null
          agente_pausado_por?: string | null
          agente_responder_em?: string | null
          archived_at?: string | null
          classification?: string | null
          contact_e164?: string | null
          contact_lid?: string | null
          contact_name?: string | null
          created_at?: string
          foto_em?: string | null
          foto_erro?: string | null
          foto_origem?: string | null
          foto_path?: string | null
          foto_url?: string | null
          group_jid?: string | null
          group_subject?: string | null
          id?: string
          instance_id?: string | null
          is_group?: boolean
          last_message_at?: string | null
          last_message_body?: string | null
          lead_id?: string | null
          organization_id: string
          property_id?: string | null
          ref_code?: string | null
          unread_count?: number
          updated_at?: string
        }
        Update: {
          agente_espera_desde?: string | null
          agente_pausado_em?: string | null
          agente_pausado_por?: string | null
          agente_responder_em?: string | null
          archived_at?: string | null
          classification?: string | null
          contact_e164?: string | null
          contact_lid?: string | null
          contact_name?: string | null
          created_at?: string
          foto_em?: string | null
          foto_erro?: string | null
          foto_origem?: string | null
          foto_path?: string | null
          foto_url?: string | null
          group_jid?: string | null
          group_subject?: string | null
          id?: string
          instance_id?: string | null
          is_group?: boolean
          last_message_at?: string | null
          last_message_body?: string | null
          lead_id?: string | null
          organization_id?: string
          property_id?: string | null
          ref_code?: string | null
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_agente_pausado_por_fkey"
            columns: ["agente_pausado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_inbox: {
        Row: {
          attempts: number
          error: string | null
          event_type: string
          id: string
          instance_id: string
          organization_id: string
          payload: Json
          processed_at: string | null
          provider_event_id: string | null
          received_at: string
          status: string
        }
        Insert: {
          attempts?: number
          error?: string | null
          event_type: string
          id?: string
          instance_id: string
          organization_id: string
          payload: Json
          processed_at?: string | null
          provider_event_id?: string | null
          received_at?: string
          status?: string
        }
        Update: {
          attempts?: number
          error?: string | null
          event_type?: string
          id?: string
          instance_id?: string
          organization_id?: string
          payload?: Json
          processed_at?: string | null
          provider_event_id?: string | null
          received_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_inbox_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_inbox_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          agente_ativo: boolean
          base_url: string
          connected_name: string | null
          connected_phone_e164: string | null
          created_at: string
          created_by: string | null
          id: string
          label: string
          last_error: string | null
          last_seen_at: string | null
          organization_id: string
          owner_id: string | null
          provider: string
          provider_instance_id: string | null
          provider_instance_name: string | null
          status: string
          token_secret_id: string | null
          updated_at: string
          webhook_configured_at: string | null
          webhook_rotated_at: string | null
          webhook_secret_hash: string | null
        }
        Insert: {
          agente_ativo?: boolean
          base_url: string
          connected_name?: string | null
          connected_phone_e164?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          last_error?: string | null
          last_seen_at?: string | null
          organization_id: string
          owner_id?: string | null
          provider?: string
          provider_instance_id?: string | null
          provider_instance_name?: string | null
          status?: string
          token_secret_id?: string | null
          updated_at?: string
          webhook_configured_at?: string | null
          webhook_rotated_at?: string | null
          webhook_secret_hash?: string | null
        }
        Update: {
          agente_ativo?: boolean
          base_url?: string
          connected_name?: string | null
          connected_phone_e164?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          last_error?: string | null
          last_seen_at?: string | null
          organization_id?: string
          owner_id?: string | null
          provider?: string
          provider_instance_id?: string | null
          provider_instance_name?: string | null
          status?: string
          token_secret_id?: string | null
          updated_at?: string
          webhook_configured_at?: string | null
          webhook_rotated_at?: string | null
          webhook_secret_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_instances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_instances_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          automatica: boolean
          body: string | null
          conversation_id: string
          created_at: string
          dedupe_key: string
          direction: string
          error: string | null
          id: string
          instance_id: string | null
          kind: string
          lead_id: string | null
          media_bytes: number | null
          media_filename: string | null
          media_mime: string | null
          media_path: string | null
          media_status: string
          occurred_at: string
          organization_id: string
          provider_message_id: string | null
          raw: Json
          ref_code: string | null
          revoked_at: string | null
          sent_by: string | null
          status: string
          status_at: string | null
          transcript: string | null
        }
        Insert: {
          automatica?: boolean
          body?: string | null
          conversation_id: string
          created_at?: string
          dedupe_key: string
          direction: string
          error?: string | null
          id?: string
          instance_id?: string | null
          kind?: string
          lead_id?: string | null
          media_bytes?: number | null
          media_filename?: string | null
          media_mime?: string | null
          media_path?: string | null
          media_status?: string
          occurred_at: string
          organization_id: string
          provider_message_id?: string | null
          raw?: Json
          ref_code?: string | null
          revoked_at?: string | null
          sent_by?: string | null
          status?: string
          status_at?: string | null
          transcript?: string | null
        }
        Update: {
          automatica?: boolean
          body?: string | null
          conversation_id?: string
          created_at?: string
          dedupe_key?: string
          direction?: string
          error?: string | null
          id?: string
          instance_id?: string | null
          kind?: string
          lead_id?: string | null
          media_bytes?: number | null
          media_filename?: string | null
          media_mime?: string | null
          media_path?: string | null
          media_status?: string
          occurred_at?: string
          organization_id?: string
          provider_message_id?: string | null
          raw?: Json
          ref_code?: string | null
          revoked_at?: string | null
          sent_by?: string | null
          status?: string
          status_at?: string | null
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversas_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_outbox: {
        Row: {
          attempts: number
          body: string | null
          caption: string | null
          conversation_id: string
          created_at: string
          error: string | null
          id: string
          instance_id: string
          kind: string
          max_attempts: number
          media_filename: string | null
          media_path: string | null
          message_id: string
          next_attempt_at: string
          organization_id: string
          provider_message_id: string | null
          requested_by: string | null
          sent_at: string | null
          status: string
          to_e164: string
        }
        Insert: {
          attempts?: number
          body?: string | null
          caption?: string | null
          conversation_id: string
          created_at?: string
          error?: string | null
          id?: string
          instance_id: string
          kind?: string
          max_attempts?: number
          media_filename?: string | null
          media_path?: string | null
          message_id: string
          next_attempt_at?: string
          organization_id: string
          provider_message_id?: string | null
          requested_by?: string | null
          sent_at?: string | null
          status?: string
          to_e164: string
        }
        Update: {
          attempts?: number
          body?: string | null
          caption?: string | null
          conversation_id?: string
          created_at?: string
          error?: string | null
          id?: string
          instance_id?: string
          kind?: string
          max_attempts?: number
          media_filename?: string | null
          media_path?: string | null
          message_id?: string
          next_attempt_at?: string
          organization_id?: string
          provider_message_id?: string | null
          requested_by?: string | null
          sent_at?: string | null
          status?: string
          to_e164?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_outbox_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversas_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_outbox_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_outbox_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_outbox_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_outbox_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_outbox_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      whatsapp_conversas_v: {
        Row: {
          archived_at: string | null
          classification: string | null
          contact_e164: string | null
          contact_lid: string | null
          contact_name: string | null
          estado: string | null
          foto_url: string | null
          group_subject: string | null
          id: string | null
          instance_id: string | null
          is_group: boolean | null
          last_message_at: string | null
          last_message_body: string | null
          lead_excluido: boolean | null
          lead_id: string | null
          lead_nome: string | null
          lead_source: string | null
          numero_e_meu: boolean | null
          numero_estado: string | null
          numero_rotulo: string | null
          organization_id: string | null
          property_id: string | null
          ref_code: string | null
          unread_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      agente_pegar_tarefas: {
        Args: { _limite?: number }
        Returns: {
          conversa: string
          instancia: string
          organizacao: string
        }[]
      }
      avisar_espera_longa: { Args: never; Returns: number }
      cc_from_e164: { Args: { _e164: string }; Returns: string }
      create_notification: {
        Args: {
          _actor?: string
          _body?: string
          _entity_id?: string
          _entity_type?: string
          _link_path?: string
          _org: string
          _recipients: string[]
          _title: string
          _type: string
        }
        Returns: number
      }
      current_org_id: { Args: never; Returns: string }
      definir_proprietario: {
        Args: { _cidade: string; _imovel: string; _nome: string; _telefone: string }
        Returns: string
      }
      dono_do_anuncio: {
        Args: { _ad_id: string; _org: string }
        Returns: string
      }
      e_admin: { Args: { _org: string }; Returns: boolean }
      encaixe_do_texto: { Args: { _texto: string }; Returns: string }
      enfileirar_mensagem: {
        Args: { _autor?: string; _body: string; _conversation_id: string }
        Returns: string
      }
      finalidade_do_texto: { Args: { _texto: string }; Returns: string }
      find_or_create_lead: {
        Args: {
          _attribution?: Json
          _email?: string
          _entry_point?: string
          _full_name: string
          _org: string
          _phone?: string
          _phone_cc?: string
          _property_id?: string
          _source?: string
        }
        Returns: {
          o_is_new: boolean
          o_lead_id: string
        }[]
      }
      fuso_da_org: { Args: { _org: string }; Returns: string }
      has_role_in_org: {
        Args: { _org: string; _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      incrementar_falha_push: { Args: { _id: string }; Returns: undefined }
      inicio_do_dia: { Args: { _dia: string; _tz: string }; Returns: string }
      instante_do_provedor: { Args: { _bruto: string }; Returns: string }
      is_admin_or_above: { Args: { _org: string }; Returns: boolean }
      landing_do_ref: {
        Args: {
          _market: string
          _org: string
          _public_code: string
          _variant: string
        }
        Returns: string
      }
      landing_gerar: {
        Args: { _layout?: string; _mercado: string; _property_id: string }
        Returns: {
          angulo: string
          created_at: string
          cta_kind: string
          cta_label: string | null
          headline: string | null
          id: string
          is_published: boolean
          layout: string
          locale: string
          market: string
          organization_id: string
          property_id: string
          published_at: string | null
          subheadline: string | null
          updated_at: string
          variant: string
        }[]
        SetofOptions: {
          from: "*"
          to: "landing_pages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      landing_marco: {
        Args: { _marco: string; _pagina: string }
        Returns: undefined
      }
      landing_placar: {
        Args: {
          _mercado: string
          _property_id: string
          _since: string
          _until: string
        }
        Returns: {
          angulo: string
          comecou_form: number
          cta_kind: string
          landing_page_id: string
          layout: string
          leads: number
          mercado: string
          publicada: boolean
          rolou_50: number
          rolou_75: number
          tocou_whatsapp: number
          variante: string
          visitas: number
        }[]
      }
      landing_publica: {
        Args: {
          _mercado: string
          _org_slug: string
          _slug: string
          _variante: string
        }
        Returns: Json
      }
      landing_ref_code: {
        Args: { _market: string; _public_code: string; _variant: string }
        Returns: string
      }
      landing_visita: { Args: { _pagina: string }; Returns: undefined }
      lead_e_meu: { Args: { _lead_id: string }; Returns: boolean }
      lead_origem_meta: {
        Args: { _lead: string }
        Returns: {
          anuncio: string
          campanha: string
          conjunto: string
          conta: string
          permalink: string
          situacao: string
        }[]
      }
      lead_preencher_qualificacao: {
        Args: {
          _encaixe?: string
          _finalidade?: string
          _lead: string
          _origem: string
          _prazo?: string
        }
        Returns: boolean
      }
      leads_da_exportacao: {
        Args: {
          _etapa: string
          _fim: string
          _ini: string
          _org: string
          _responsavel: string
        }
        Returns: {
          ab_contaminated: boolean
          assigned_to: string | null
          attribution_method: string
          city: string | null
          commission_pct: number | null
          created_at: string
          deal_value_cents: number | null
          email: string | null
          encaixe_financeiro: string | null
          entry_point: string | null
          espera_avisada: string | null
          esperando_desde: string | null
          excluded_at: string | null
          fbclid: string | null
          finalidade: string | null
          first_contact_at: string | null
          ft_landing_page_id: string | null
          ft_locale: string | null
          ft_meta_ad_id: string | null
          ft_occurred_at: string | null
          ft_utm_campaign: string | null
          ft_utm_source: string | null
          ft_variant: string | null
          full_name: string
          furthest_position: number
          gclid: string | null
          id: string
          landing_page_url: string | null
          loss_reason: string | null
          loss_reason_text: string | null
          lt_landing_page_id: string | null
          lt_meta_ad_id: string | null
          lt_occurred_at: string | null
          lt_variant: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          phone_country: string
          phone_e164: string | null
          prazo_compra: string | null
          referrer: string | null
          silencio_desde: string | null
          source: string
          stage_changed_at: string
          stage_id: string
          tags: string[]
          temperatura: string | null
          temperatura_manual: string | null
          temperatura_regra: string | null
          toques_sem_resposta: number
          updated_at: string
          variants_seen: string[]
        }[]
        SetofOptions: {
          from: "*"
          to: "leads"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      leads_de_qual_pagina: {
        Args: { _leads: string[] }
        Returns: {
          imovel: string
          lead_id: string
          mercado: string
          rotulo: string
          url: string
          variante: string
        }[]
      }
      leads_etiquetas: {
        Args: { _leads: string[] }
        Returns: {
          conta: string
          lead_id: string
          responsavel: string
        }[]
      }
      leads_exportar: {
        Args: {
          _ate: string
          _de: string
          _etapa?: string
          _responsavel?: string
          _so_contar?: boolean
        }
        Returns: Json
      }
      limitar: {
        Args: { _chave: string; _janela: string; _teto: number }
        Returns: boolean
      }
      limpar_credencial_do_passado: {
        Args: { _lote?: number }
        Returns: number
      }
      log_timeline_event: {
        Args: {
          _actor?: string
          _category: string
          _description?: string
          _event_type: string
          _lead_id: string
          _metadata?: Json
          _title: string
        }
        Returns: string
      }
      marcar_conversa_lida: {
        Args: { _conversation_id: string }
        Returns: undefined
      }
      meta_cobertura_atribuicao: {
        Args: { _since: string; _until: string }
        Returns: {
          com_atribuicao: number
          total: number
        }[]
      }
      meta_conexao_e_minha: { Args: { _integracao: string }; Returns: boolean }
      meta_conta_e_minha: { Args: { _ad_account_id: string }; Returns: boolean }
      meta_conversao_descartar: {
        Args: { _id: string; _motivo: string }
        Returns: undefined
      }
      meta_conversao_enfileirar: {
        Args: {
          _evento: string
          _lead: string
          _quando: string
          _valor?: number
        }
        Returns: undefined
      }
      meta_conversao_enviada: { Args: { _id: string }; Returns: undefined }
      meta_conversao_falhou: {
        Args: { _codigo?: number; _id: string; _motivo?: string }
        Returns: undefined
      }
      meta_conversoes_drenar: { Args: never; Returns: undefined }
      meta_conversoes_expirar: { Args: never; Returns: number }
      meta_conversoes_pendencia: {
        Args: never
        Returns: {
          o_detalhe: string
          o_quantos: number
          o_titulo: string
        }[]
      }
      meta_conversoes_reenfileirar: {
        Args: { _limite?: number }
        Returns: number
      }
      meta_conversoes_reivindicar: {
        Args: { _limite?: number }
        Returns: {
          o_acao: string
          o_ctwa_clid: string
          o_dataset_id: string
          o_email: string
          o_evento: string
          o_id: string
          o_ocorrido_em: string
          o_page_id: string
          o_pixel_id: string
          o_telefone: string
          o_valor_centavos: number
          o_waba_id: string
        }[]
      }
      meta_conversoes_resumo: {
        Args: never
        Returns: {
          o_enviados: number
          o_evento: string
          o_expirou: number
          o_falhou: number
          o_na_fila: number
        }[]
      }
      meta_drenar: { Args: never; Returns: undefined }
      meta_evento_falhou: {
        Args: { _codigo?: number; _id: string; _motivo?: string }
        Returns: undefined
      }
      meta_fora_do_painel_anuncios: { Args: never; Returns: string[] }
      meta_fora_do_painel_campanhas: { Args: never; Returns: string[] }
      meta_gasto_agregado: {
        Args: { _nivel?: string; _since: string; _until: string }
        Returns: {
          cadastros: number
          campanha: string
          clicks: number
          conta: string
          conversas: number
          currency: string
          impressions: number
          leads_atribuidos: number
          nome: string
          object_id: string
          objective: string
          spend_minor: number
          status: string
        }[]
      }
      meta_importar_gasto: { Args: { _modo?: string }; Returns: undefined }
      meta_reivindicar_conta: {
        Args: {
          _ad_account_id: string
          _fuso?: string
          _integracao: string
          _moeda?: string
          _nome?: string
        }
        Returns: string
      }
      meta_reivindicar_eventos: {
        Args: { _limit?: number }
        Returns: {
          attempts: number
          form_id: string | null
          id: string
          integration_id: string | null
          last_error_code: number | null
          lead_id: string | null
          leadgen_id: string
          motivo: string | null
          next_attempt_at: string
          organization_id: string
          page_id: string
          payload: Json
          processed_at: string | null
          received_at: string
          signature_ok: boolean
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "meta_webhook_inbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      meta_reivindicar_pagina: {
        Args: { _integracao: string; _nome?: string; _page_id: string }
        Returns: string
      }
      meta_saude: {
        Args: {
          _codigo?: number
          _integracao: string
          _msg?: string
          _saude: string
        }
        Returns: undefined
      }
      meta_soltar_presas: { Args: { _minutos?: number }; Returns: number }
      meta_ultima_sincronizacao: {
        Args: never
        Returns: {
          ad_account_id: string
          error_message: string
          finished_at: string
          kind: string
          rows_written: number
          status: string
          truncated: boolean
        }[]
      }
      meta_verificar_presos: { Args: never; Returns: number }
      meta_zerar_ausentes: {
        Args: {
          _conta: string
          _org: string
          _run: string
          _since: string
          _until: string
        }
        Returns: number
      }
      mkt_cadeia_por_anuncio: {
        Args: { _since: string; _until: string }
        Returns: Json
      }
      mkt_inteligencia: {
        Args: { _since: string; _until: string }
        Returns: Json
      }
      mkt_por_angulo: {
        Args: { _since: string; _until: string }
        Returns: Json
      }
      nome_curto_do_imovel: { Args: { _titulo: string }; Returns: string }
      notification_audience: {
        Args: { _dono?: string; _lead_id?: string; _org: string }
        Returns: string[]
      }
      painel_funil: {
        Args: { _ate: string; _de: string; _org: string }
        Returns: Json
      }
      painel_indicadores: {
        Args: { _since: string; _until: string }
        Returns: Json
      }
      painel_janela: {
        Args: { _ate: string; _de: string; _org: string }
        Returns: Json
      }
      painel_origens: {
        Args: { _ate: string; _de: string; _org: string }
        Returns: Json
      }
      painel_serie: {
        Args: { _ate: string; _de: string; _org: string }
        Returns: Json
      }
      pais_da_discagem: { Args: { _e164: string }; Returns: string }
      parse_ref_code: {
        Args: { _texto: string }
        Returns: {
          o_market: string
          o_public_code: string
          o_variant: string
        }[]
      }
      pessoais_contagem: { Args: never; Returns: number }
      pode_ver_conversa: { Args: { _conv_id: string }; Returns: boolean }
      pode_ver_documento: { Args: { _doc_id: string }; Returns: boolean }
      pode_ver_pasta_de_lead: { Args: { _lead: string }; Returns: boolean }
      porta_da_mensagem: {
        Args: { _raw: Json; _ref_code: string }
        Returns: string
      }
      prazo_do_texto: { Args: { _texto: string }; Returns: string }
      processar_inbox: { Args: { _limit?: number }; Returns: number }
      push_drenar: { Args: never; Returns: undefined }
      push_verificar_atraso: { Args: { _minutos?: number }; Returns: number }
      quem_ve_a_conversa: { Args: { _conv: string }; Returns: string[] }
      registrar_visita: {
        Args: { _codigo: string; _organizacao: string }
        Returns: undefined
      }
      run_due_reminders: { Args: { _limit?: number }; Returns: number }
      sem_credencial: { Args: { _payload: Json }; Returns: Json }
      site_imoveis: { Args: { _organizacao: string }; Returns: Json }
      slugify: { Args: { _txt: string }; Returns: string }
      snooze_reminder: {
        Args: { _id: string; _minutos: number }
        Returns: undefined
      }
      temperatura_pela_regra: {
        Args: { _encaixe: string; _prazo: string }
        Returns: string
      }
      tipo_da_mensagem: { Args: { _msg: Json }; Returns: string }
      titulo_publico: {
        Args: {
          _bairro: string
          _cidade: string
          _public_title: string
          _quartos: number
          _tipo: string
        }
        Returns: string
      }
      to_base36: { Args: { _n: number }; Returns: string }
      to_e164: { Args: { _cc: string; _raw: string }; Returns: string }
      touch_lead_attribution: {
        Args: { _attr: Json; _lead_id: string }
        Returns: undefined
      }
      vault_apagar: { Args: { _id: string }; Returns: undefined }
      vault_guardar: {
        Args: { _nome: string; _valor: string }
        Returns: string
      }
      vault_ler: { Args: { _id: string }; Returns: string }
      ve_a_carteira_toda: { Args: never; Returns: boolean }
      visit_conflicts: {
        Args: {
          _assigned_to: string
          _ends_at: string
          _ignore_id?: string
          _starts_at: string
        }
        Returns: {
          o_ends_at: string
          o_lead_name: string
          o_starts_at: string
          o_visit_id: string
        }[]
      }
      wa_classificar_conversa: {
        Args: { _classificacao?: string; _conversa: string }
        Returns: string
      }
      wa_e_pessoal: {
        Args: { _classification: string; _is_group: boolean }
        Returns: boolean
      }
      wa_estado_da_conversa: { Args: { _conv: string }; Returns: string }
      wa_numero_resumo: {
        Args: { _instancia: string }
        Returns: {
          e_meu: boolean
          estado: string
          rotulo: string
        }[]
      }
      wa_tem_origem: {
        Args: {
          _ft_landing_page_id: string
          _ft_meta_ad_id: string
          _ft_utm_source: string
          _property_id: string
          _ref_code: string
          _source: string
        }
        Returns: boolean
      }
      whatsapp_alarmes: {
        Args: never
        Returns: {
          desde: string
          e_meu: boolean
          id: string
          label: string
          status: string
          telefone: string
        }[]
      }
      whatsapp_drenar_saida: { Args: never; Returns: undefined }
      whatsapp_fotos_pendentes: {
        Args: { _limite?: number }
        Returns: {
          caminho_novo: string
          foto_url: string
          id: string
          organization_id: string
        }[]
      }
      whatsapp_quem_avisar: {
        Args: { _dono: string; _org: string }
        Returns: string[]
      }
      whatsapp_saude: { Args: { _minutos?: number }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "gerente" | "corretor"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "gerente", "corretor"],
    },
  },
} as const
