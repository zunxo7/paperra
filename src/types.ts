export const SYLLABUS_TOPICS = [
  { id: "1.1", title: "Number systems", description: "Binary, denary, hexadecimal, conversions, binary addition, overflow, logical shifts, two's complement" },
  { id: "1.2", title: "Text, sound and images", description: "Character sets (ASCII, Unicode), sound sampling, resolution, sample rate, image representation, pixels, colour depth" },
  { id: "1.3", title: "Data storage and compression", description: "Measurement of data storage (bit, byte, KiB, MiB, etc.), file size calculations, lossy and lossless compression" },
  { id: "2.1", title: "Types and methods of data transmission", description: "Packets, packet switching, serial, parallel, simplex, half-duplex, full-duplex, USB" },
  { id: "2.2", title: "Methods of error detection", description: "Parity checks, checksum, echo check, check digits, ARQ" },
  { id: "2.3", title: "Encryption", description: "Symmetric and asymmetric encryption, public and private keys" },
  { id: "3.1", title: "Computer architecture", description: "CPU, Von Neumann architecture, ALU, CU, registers (PC, MAR, MDR, CIR, ACC), buses, FDE cycle, cores, cache, clock, instruction sets, embedded systems" },
  { id: "3.2", title: "Input and output devices", description: "Sensors, scanners, cameras, keyboards, mice, screens, printers, speakers, actuators" },
  { id: "3.3", title: "Data storage", description: "Primary storage (RAM, ROM), secondary storage (HDD, SSD), magnetic, optical, solid-state, virtual memory, cloud storage" },
  { id: "3.4", title: "Network hardware", description: "NIC, MAC addresses, IP addresses (IPv4, IPv6), routers" },
  { id: "4.1", title: "Types of software and interrupts", description: "System software, application software, operating systems, interrupts" },
  { id: "4.2", title: "Translators and IDEs", description: "High-level and low-level languages, assembly, compilers, interpreters, IDE features" },
  { id: "5.1", title: "The internet and the world wide web", description: "Internet vs WWW, URLs, HTTP, HTTPS, web browsers, DNS, cookies" },
  { id: "5.2", title: "Digital currency", description: "Digital currency, blockchain" },
  { id: "5.3", title: "Cyber security", description: "Cyber security threats (hacking, malware, phishing, etc.), security solutions (firewalls, SSL, etc.)" },
  { id: "6.1", title: "Automated systems", description: "Sensors, microprocessors, actuators in automated systems" },
  { id: "6.2", title: "Robotics", description: "Characteristics of robots, roles of robots" },
  { id: "6.3", title: "Artificial intelligence", description: "AI characteristics, expert systems, machine learning" },
  { id: "7", title: "Algorithm design and problem-solving", description: "Program development life cycle, decomposition, abstraction, flowcharts, pseudocode, trace tables, validation, verification" },
  { id: "8.1", title: "Programming concepts", description: "Variables, constants, data types, input/output, sequence, selection, iteration, totalling, counting, string handling, operators, procedures, functions, library routines" },
  { id: "8.2", title: "Arrays", description: "1D and 2D arrays, indexing" },
  { id: "8.3", title: "File handling", description: "Reading from and writing to files" },
  { id: "9", title: "Databases", description: "Single-table databases, fields, records, data types, primary keys, SQL (SELECT, FROM, WHERE, ORDER BY, etc.)" },
  { id: "10", title: "Boolean logic", description: "Logic gates (NOT, AND, OR, NAND, NOR, XOR), truth tables, logic circuits, logic expressions" }
];

export interface QuestionPart {
  label?: string;
  topicId?: string;
  questionImages?: string[];
  markingSchemeImages?: string[];
  text?: string;
}

export interface Question {
  id: string;
  paperId: string;
  number: number;
  label?: string;
  text: string;
  marks: number;
  topicId: string;
  questionImage?: string;
  questionImages?: string[];
  answer?: string;
  markingScheme?: string;
  markingSchemeImage?: string;
  markingSchemeImages?: string[];
  parts?: QuestionPart[];
}

export interface PaperMetadata {
  year: number;
  session: 'm' | 's' | 'w'; // March, Summer, Winter
  variant: number; // 11, 12, 13, 21, 22, 23
  type: 'qp' | 'ms';
}
