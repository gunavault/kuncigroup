import 'dotenv/config';import {bootstrapAdministrator} from '../src/lib/auth';import {db} from '../src/lib/db';await bootstrapAdministrator();await db.$disconnect();console.log('LOCAL_ADMIN_READY');
