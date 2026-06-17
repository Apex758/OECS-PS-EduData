--
-- PostgreSQL database dump
--

\restrict T4avg5unh2075n3xjzdPcy8zzwEtHn2BcddCVG2hYECMXiNQlFBRvv8khMdmRHG

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: list_demo_personas(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_demo_personas() RETURNS TABLE(id integer, email text, name text, role text, country_id integer)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select id, email, name, role, country_id
  from app_users where is_demo order by role, email;
$$;


--
-- Name: resolve_user_by_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_user_by_email(p_email text) RETURNS TABLE(id integer, email text, name text, role text, country_id integer)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select id, email, name, role, country_id
  from app_users where lower(email) = lower(p_email);
$$;


--
-- Name: resolve_user_by_id(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_user_by_id(p_id integer) RETURNS TABLE(id integer, email text, name text, role text, country_id integer)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select id, email, name, role, country_id from app_users where id = p_id;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: app_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_users (
    id integer NOT NULL,
    email text NOT NULL,
    name text,
    role text NOT NULL,
    country_id integer,
    is_demo boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_users_role_check CHECK ((role = ANY (ARRAY['teacher'::text, 'minister'::text, 'admin'::text])))
);

ALTER TABLE ONLY public.app_users FORCE ROW LEVEL SECURITY;


--
-- Name: app_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.app_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: app_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.app_users_id_seq OWNED BY public.app_users.id;


--
-- Name: countries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.countries (
    id integer NOT NULL,
    iso_code text NOT NULL,
    name text NOT NULL
);

ALTER TABLE ONLY public.countries FORCE ROW LEVEL SECURITY;


--
-- Name: countries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.countries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: countries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.countries_id_seq OWNED BY public.countries.id;


--
-- Name: institutions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.institutions (
    id integer NOT NULL,
    country_id integer NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'ministry'::text NOT NULL
);

ALTER TABLE ONLY public.institutions FORCE ROW LEVEL SECURITY;


--
-- Name: institutions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.institutions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: institutions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.institutions_id_seq OWNED BY public.institutions.id;


--
-- Name: school_api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.school_api_keys (
    id integer NOT NULL,
    school_id integer NOT NULL,
    key_hash text NOT NULL,
    label text,
    revoked boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone
);

ALTER TABLE ONLY public.school_api_keys FORCE ROW LEVEL SECURITY;


--
-- Name: school_api_keys_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.school_api_keys_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: school_api_keys_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.school_api_keys_id_seq OWNED BY public.school_api_keys.id;


--
-- Name: schools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schools (
    id integer NOT NULL,
    country_id integer NOT NULL,
    institution_id integer,
    code text NOT NULL,
    name text NOT NULL,
    level text
);

ALTER TABLE ONLY public.schools FORCE ROW LEVEL SECURITY;


--
-- Name: schools_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.schools_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: schools_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.schools_id_seq OWNED BY public.schools.id;


--
-- Name: student_mapping; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_mapping (
    ruli text NOT NULL,
    school_id integer NOT NULL,
    country_id integer NOT NULL,
    salt text NOT NULL,
    sensitive jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.student_mapping FORCE ROW LEVEL SECURITY;


--
-- Name: students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.students (
    id integer NOT NULL,
    ruli text NOT NULL,
    school_id integer NOT NULL,
    country_id integer NOT NULL,
    class text,
    gender text,
    age integer,
    metadata jsonb,
    is_demo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    identity_hash text
);

ALTER TABLE ONLY public.students FORCE ROW LEVEL SECURITY;


--
-- Name: students_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.students_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: students_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.students_id_seq OWNED BY public.students.id;


--
-- Name: user_schools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_schools (
    user_id integer NOT NULL,
    school_id integer NOT NULL
);

ALTER TABLE ONLY public.user_schools FORCE ROW LEVEL SECURITY;


--
-- Name: app_users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users ALTER COLUMN id SET DEFAULT nextval('public.app_users_id_seq'::regclass);


--
-- Name: countries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.countries ALTER COLUMN id SET DEFAULT nextval('public.countries_id_seq'::regclass);


--
-- Name: institutions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institutions ALTER COLUMN id SET DEFAULT nextval('public.institutions_id_seq'::regclass);


--
-- Name: school_api_keys id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_api_keys ALTER COLUMN id SET DEFAULT nextval('public.school_api_keys_id_seq'::regclass);


--
-- Name: schools id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schools ALTER COLUMN id SET DEFAULT nextval('public.schools_id_seq'::regclass);


--
-- Name: students id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students ALTER COLUMN id SET DEFAULT nextval('public.students_id_seq'::regclass);


--
-- Name: app_users app_users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT app_users_email_key UNIQUE (email);


--
-- Name: app_users app_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT app_users_pkey PRIMARY KEY (id);


--
-- Name: countries countries_iso_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.countries
    ADD CONSTRAINT countries_iso_code_key UNIQUE (iso_code);


--
-- Name: countries countries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.countries
    ADD CONSTRAINT countries_pkey PRIMARY KEY (id);


--
-- Name: institutions institutions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institutions
    ADD CONSTRAINT institutions_pkey PRIMARY KEY (id);


--
-- Name: school_api_keys school_api_keys_key_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_api_keys
    ADD CONSTRAINT school_api_keys_key_hash_key UNIQUE (key_hash);


--
-- Name: school_api_keys school_api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_api_keys
    ADD CONSTRAINT school_api_keys_pkey PRIMARY KEY (id);


--
-- Name: schools schools_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_code_key UNIQUE (code);


--
-- Name: schools schools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_pkey PRIMARY KEY (id);


--
-- Name: student_mapping student_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_mapping
    ADD CONSTRAINT student_mapping_pkey PRIMARY KEY (ruli);


--
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (id);


--
-- Name: students students_ruli_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_ruli_key UNIQUE (ruli);


--
-- Name: user_schools user_schools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_schools
    ADD CONSTRAINT user_schools_pkey PRIMARY KEY (user_id, school_id);


--
-- Name: idx_api_keys_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_keys_school ON public.school_api_keys USING btree (school_id);


--
-- Name: idx_mapping_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mapping_school ON public.student_mapping USING btree (school_id);


--
-- Name: schools_country_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX schools_country_id_idx ON public.schools USING btree (country_id);


--
-- Name: students_country_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX students_country_id_idx ON public.students USING btree (country_id);


--
-- Name: students_school_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX students_school_id_idx ON public.students USING btree (school_id);


--
-- Name: uq_students_school_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_students_school_identity ON public.students USING btree (school_id, identity_hash) WHERE (identity_hash IS NOT NULL);


--
-- Name: user_schools_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_schools_user_id_idx ON public.user_schools USING btree (user_id);


--
-- Name: app_users app_users_country_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT app_users_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.countries(id);


--
-- Name: institutions institutions_country_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institutions
    ADD CONSTRAINT institutions_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.countries(id);


--
-- Name: schools schools_country_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.countries(id);


--
-- Name: schools schools_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: students students_country_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.countries(id);


--
-- Name: students students_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--
-- Name: user_schools user_schools_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_schools
    ADD CONSTRAINT user_schools_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: user_schools user_schools_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_schools
    ADD CONSTRAINT user_schools_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: school_api_keys api_keys_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY api_keys_admin ON public.school_api_keys USING ((current_setting('app.role'::text, true) = 'admin'::text));


--
-- Name: app_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

--
-- Name: app_users app_users_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_users_admin ON public.app_users USING ((current_setting('app.role'::text, true) = 'admin'::text));


--
-- Name: app_users app_users_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_users_self ON public.app_users FOR SELECT USING ((id = (NULLIF(current_setting('app.user_id'::text, true), ''::text))::integer));


--
-- Name: countries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

--
-- Name: countries countries_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY countries_access ON public.countries USING (((current_setting('app.role'::text, true) = 'admin'::text) OR (id = (NULLIF(current_setting('app.country_id'::text, true), ''::text))::integer)));


--
-- Name: institutions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;

--
-- Name: institutions institutions_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY institutions_access ON public.institutions USING (((current_setting('app.role'::text, true) = 'admin'::text) OR ((current_setting('app.role'::text, true) = 'minister'::text) AND (country_id = (NULLIF(current_setting('app.country_id'::text, true), ''::text))::integer))));


--
-- Name: school_api_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.school_api_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: schools; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

--
-- Name: schools schools_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY schools_access ON public.schools USING (((current_setting('app.role'::text, true) = 'admin'::text) OR ((current_setting('app.role'::text, true) = 'minister'::text) AND (country_id = (NULLIF(current_setting('app.country_id'::text, true), ''::text))::integer)) OR ((current_setting('app.role'::text, true) = 'teacher'::text) AND (id IN ( SELECT us.school_id
   FROM public.user_schools us
  WHERE (us.user_id = (NULLIF(current_setting('app.user_id'::text, true), ''::text))::integer))))));


--
-- Name: student_mapping; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_mapping ENABLE ROW LEVEL SECURITY;

--
-- Name: student_mapping student_mapping_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_mapping_admin ON public.student_mapping USING ((current_setting('app.role'::text, true) = 'admin'::text));


--
-- Name: students; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

--
-- Name: students students_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY students_access ON public.students USING (((current_setting('app.role'::text, true) = 'admin'::text) OR ((current_setting('app.role'::text, true) = 'minister'::text) AND (country_id = (NULLIF(current_setting('app.country_id'::text, true), ''::text))::integer)) OR ((current_setting('app.role'::text, true) = 'teacher'::text) AND (school_id IN ( SELECT us.school_id
   FROM public.user_schools us
  WHERE (us.user_id = (NULLIF(current_setting('app.user_id'::text, true), ''::text))::integer))))));


--
-- Name: user_schools; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_schools ENABLE ROW LEVEL SECURITY;

--
-- Name: user_schools user_schools_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_schools_admin ON public.user_schools USING ((current_setting('app.role'::text, true) = 'admin'::text));


--
-- Name: user_schools user_schools_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_schools_self ON public.user_schools FOR SELECT USING ((user_id = (NULLIF(current_setting('app.user_id'::text, true), ''::text))::integer));


--
-- PostgreSQL database dump complete
--

\unrestrict T4avg5unh2075n3xjzdPcy8zzwEtHn2BcddCVG2hYECMXiNQlFBRvv8khMdmRHG

