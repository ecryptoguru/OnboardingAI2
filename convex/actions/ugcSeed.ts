"use node";

import { internalAction } from "../_generated/server";
import { api } from "../_generated/api";

export const seed50 = internalAction({
  args: {},
  handler: async (ctx): Promise<{ addedCount: number }> => {
    const universities = [
      { type: "State", university_name: "\"Kaushalya\" the Skill University", address: "Mahatma Gandhi Labour Institute (MGLI), Drive-in Road, Memnagar, Ahmedabad", zip_code: "380052", state: "Gujarat", ugc_status: "2(f)", website: "https://kaushalyaskilluniversity.ac.in/" },
      { type: "Private", university_name: "A.K.S. University", address: "SherGanj, Satna", zip_code: "485001", state: "Madhya Pradesh", ugc_status: "2(f)", website: "https://www.aksuniversity.ac.in/" },
      { type: "Private", university_name: "A.P.G. (Alakh Prakash Goyal) Shimla University", address: "Shogi- Mehli Bypass Road, Shimla, H.P 171013", zip_code: "171009", state: "Himachal Pradesh", ugc_status: "2(f)", website: "http://agu.edu.in/" },
      { type: "State", university_name: "A.P.J. Abdul Kalam Technological University", address: "CET Campus, Alathara RdAmbady Nagar, Thiruvananthapuram", zip_code: "695016", state: "Kerala", ugc_status: "2(f)", website: "https://ktu.edu.in/" },
      { type: "Private", university_name: "AAFT University of Media and Arts", address: "Vill-Maath, Tehsil-Tilda, Dist-Raipur", zip_code: "493225", state: "Chhattisgarh", ugc_status: "2(f)", website: "https://aaft.edu.in/" },
      { type: "Private", university_name: "Abhilashi University", address: "Chailchowk (Chaichiot)Tehsil chachyot, distt. Mandi", zip_code: "175045", state: "Himachal Pradesh", ugc_status: "2(f)", website: "http://www.abhilashiuniversity.com/" },
      { type: "Private", university_name: "Abhyuday University", address: "Garam Magriya, Khandwa Road, Khargone", zip_code: "451001", state: "Madhya Pradesh", ugc_status: "2(f)", website: "https://abhyudayuniversity.com/" },
      { type: "Deemed", university_name: "Academy of Maritime Education and Training", address: "135, East Coast Road, Kanathur", zip_code: "603112", state: "Tamil Nadu", ugc_status: "Section-III", website: "https://www.ametuniv.ac.in/" },
      { type: "State", university_name: "Acharaya N.G.Ranga Agricultural University", address: "Amaravathi Road,Lam, Guntur", zip_code: "522034", state: "Andhra Pradesh", ugc_status: "2(f)", website: "https://angrau.ac.in/" },
      { type: "State", university_name: "Acharya Nagarjuna University", address: "NH16,Nagarjuna Nagar,Guntur", zip_code: "522510", state: "Andhra Pradesh", ugc_status: "2(f) & 12(B)", website: "https://nagarjunauniversity.ac.in/" },
      { type: "State", university_name: "Acharya Narendra Deva Krishi Evam Prodyogik Vishwavidyalaya", address: "Kumarganj, FaizabadAyodhya", zip_code: "224229", state: "Uttar Pradesh", ugc_status: "2(f) & 12(B)", website: "https://www.nduat.org/" },
      { type: "Private", university_name: "Adamas University", address: "Barasat - Barrackpore Road, Barberia, PO Jagannathpur, PS Barasat, Kolkata", zip_code: "700126", state: "West Bengal", ugc_status: "2(f)", website: "https://adamasuniversity.ac.in/" },
      { type: "Private", university_name: "Adani University", address: "Shantigram Township, Near Vaishnodevi Circle, Ahmedabad", zip_code: "382421", state: "Gujarat", ugc_status: "2(f)", website: "https://www.adaniuni.ac.in/" },
      { type: "Private", university_name: "Adesh University", address: "NH-7, Barnala Road, Bhucho, BathindaBathinda", zip_code: "151101", state: "Punjab", ugc_status: "2(f)", website: "http://adeshuniversity.ac.in/" },
      { type: "Private", university_name: "Adichunchanagiri University", address: "Campus: NH-75, Tq- Nagamangala, Dist- Mandya, B.G. Nagara- 571448", zip_code: "571448", state: "Karnataka", ugc_status: "2(f)", website: "https://www.acu.edu.in/" },
      { type: "State", university_name: "Adikavi Nannaya University", address: "Raja Raja Nagar, Rajamahendravaram,", zip_code: "533296", state: "Andhra Pradesh", ugc_status: "2(f) & 12(B)", website: "http://www.nannayauniversity.info/" },
      { type: "Private", university_name: "Aditya University", address: "Aditya Nagar, ADB Road, Surampalem, Kakinada", zip_code: "533437", state: "Andhra Pradesh", ugc_status: "2(f)", website: "https://adityauniversity.in/" },
      { type: "Private", university_name: "Agrawan Heritage University", address: "Bamrauli Katara, Fatehabad Road, Agra", zip_code: "283125", state: "Uttar Pradesh", ugc_status: "2(f)", website: "https://www.ahu.ac.in/" },
      { type: "State", university_name: "Agriculture University, Jodhpur", address: "Mandore, Jodhpur", zip_code: "342304", state: "Rajasthan", ugc_status: "2(f)", website: "https://www.aujodhpur.ac.in/" },
      { type: "State", university_name: "Agriculture University, Kota", address: "Borkhera, Post Box No. 20, GPO Nayapura, Kota", zip_code: "324001", state: "Rajasthan", ugc_status: "2(f)", website: "https://aukota.org/" },
      { type: "Private", university_name: "Ahmedabad University", address: "Navrangpura, Ahmedabad", zip_code: "380009", state: "Gujarat", ugc_status: "2(f) & 12(B)", website: "http://www.ahduni.edu.in/" },
      { type: "Private", university_name: "AIPH University", address: "Pahal, Bhubaneswar", zip_code: "752101", state: "Odisha", ugc_status: "2(f)", website: "http://aiph.ac.in/" },
      { type: "Private", university_name: "AISECT University", address: "Matwari Chowk, Hazaribag", zip_code: "825301", state: "Jharkhand", ugc_status: "2(f)", website: "https://www.aisectuniversityjharkhand.ac.in/" },
      { type: "Private", university_name: "Ajeenkya D.Y. Patil University", address: "Charholi Budruk, Pune", zip_code: "412105", state: "Maharashtra", ugc_status: "2(f)", website: "https://adypu.edu.in/" },
      { type: "Private", university_name: "Akal University", address: "Talwandi Sabo, Bathinda", zip_code: "151302", state: "Punjab", ugc_status: "2(f)", website: "http://www.auts.ac.in/" },
      { type: "Private", university_name: "Al-Falah University", address: "Faridabad", zip_code: "121004", state: "Haryana", ugc_status: "2(f)", website: "https://alfalahuniversity.edu.in/" },
      { type: "Private", university_name: "Al-Karim University", address: "Sirsa, Karim Bagh, Katihar", zip_code: "854106", state: "Bihar", ugc_status: "2(f)", website: "https://www.alkarimuniversity.edu.in/" },
      { type: "State", university_name: "Alagappa University", address: "Karaikudi, Sivaganga District", zip_code: "630003", state: "Tamil Nadu", ugc_status: "2(f) & 12(B)", website: "https://www.alagappauniversity.ac.in/" },
      { type: "Private", university_name: "Alard University", address: "Hinjewadi, Pune", zip_code: "411057", state: "Maharashtra", ugc_status: "2(f)", website: "https://alarduniversity.edu.in/" },
      { type: "State", university_name: "Aliah University", address: "New Town, Kolkata", zip_code: "700160", state: "West Bengal", ugc_status: "2(f) & 12(B)", website: "http://www.aliah.ac.in/" },
      { type: "Central", university_name: "Aligarh Muslim University", address: "Zainul Abidin Road, Aligarh", zip_code: "202001", state: "Uttar Pradesh", ugc_status: "2(f) & 12(B)", website: "http://www.amu.ac.in/" },
      { type: "State", university_name: "Alipurduar University", address: "Alipurduar", zip_code: "736122", state: "West Bengal", ugc_status: "2(f)", website: "https://alipurduaruniversity.ac.in/" },
      { type: "Private", university_name: "Alliance University", address: "Chandapura-Anekal Main Road, Bangalore", zip_code: "562106", state: "Karnataka", ugc_status: "2(f)", website: "https://www.alliance.edu.in/" },
      { type: "Private", university_name: "Amaltas University", address: "Bangar, District-Dewas", zip_code: "455001", state: "Madhya Pradesh", ugc_status: "2(f)", website: "https://amaltasuniversity.in/" },
      { type: "Private", university_name: "Amity University, Bengaluru", address: "Devanahalli, Bengaluru Rural", zip_code: "562110", state: "Karnataka", ugc_status: "2(f)", website: "https://amity.edu/Bengaluru/" },
      { type: "Private", university_name: "Amity University, Mohali", address: "IT City, Mohali", zip_code: "140306", state: "Punjab", ugc_status: "2(f)", website: "https://www.amity.edu/mohali/" },
      { type: "Private", university_name: "Amity University, Patna", address: "Bailey Road, Patna", zip_code: "801503", state: "Bihar", ugc_status: "2(f)", website: "https://amity.edu/bihar/" },
      { type: "Private", university_name: "Amity University, Mumbai", address: "Bhatan, Panvel, Mumbai", zip_code: "410206", state: "Maharashtra", ugc_status: "2(f)", website: "http://www.amity.edu/mumbai/" },
      { type: "Private", university_name: "Amity University, Raipur", address: "Math, Tilda, Raipur", zip_code: "493225", state: "Chhattisgarh", ugc_status: "2(f)", website: "https://amity.edu/raipur" },
      { type: "Private", university_name: "Amity University, Kolkata", address: "New Town, North 24 Parganas", zip_code: "700135", state: "West Bengal", ugc_status: "2(f)", website: "https://amity.edu/kolkata/" },
      { type: "Private", university_name: "Amity University, Ranchi", address: "Main Road, Ranchi", zip_code: "834002", state: "Jharkhand", ugc_status: "2(f)", website: "http://www.amity.edu/ranchi/" },
      { type: "Private", university_name: "Amity University, Jaipur", address: "Kant Kalwar, Jaipur", zip_code: "303002", state: "Rajasthan", ugc_status: "2(f)", website: "http://amity.edu/jaipur" },
      { type: "Private", university_name: "Amity University, Noida", address: "Sector-125, Noida", zip_code: "201313", state: "Uttar Pradesh", ugc_status: "2(f)", website: "http://amity.edu/" },
      { type: "Private", university_name: "Amity University, Gurugram", address: "Panchgaon, Manesar", zip_code: "122413", state: "Haryana", ugc_status: "2(f)", website: "https://www.amity.edu/gurugram/" },
      { type: "Private", university_name: "Amity University, Gwalior", address: "Maharajpura, Gwalior", zip_code: "474005", state: "Madhya Pradesh", ugc_status: "2(f)", website: "http://www.amity.edu/" },
      { type: "Private", university_name: "Amrapali University", address: "Lamachaur, Haldwani, Nanital", zip_code: "263139", state: "Uttarakhand", ugc_status: "2(f)", website: "https://amrapali.ac.in/" },
      { type: "Deemed", university_name: "Amrita Vishwa Vidyapeetham", address: "Ettimadai, Coimbatore", zip_code: "641112", state: "Tamil Nadu", ugc_status: "Section-III", website: "http://www.amrita.edu/" },
      { type: "State", university_name: "Anand Agricultural University", address: "Anand", zip_code: "388001", state: "Gujarat", ugc_status: "2(f)", website: "http://www.aau.in/" },
      { type: "Private", university_name: "Anant National University", address: "Sanskardham Campus, Ahmedabad", zip_code: "380015", state: "Gujarat", ugc_status: "2(f)", website: "http://www.anu.edu.in/" },
      { type: "State", university_name: "Andhra Kesari University", address: "Pernamitta, Ongole, Prakasam", zip_code: "523225", state: "Andhra Pradesh", ugc_status: "2(f)", website: "http://andhrakesariuniversity.in/" }
    ];

    console.log(`Manual seed: processing ${universities.length} records...`);
    const result: { addedCount: number } = await ctx.runMutation(api.universities.bulkSyncUgc, {
      universities: universities
    });
    return result;
  },
});
